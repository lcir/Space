import { parseArgs } from 'node:util';
import { mkdir, writeFile, appendFile, readFile, rm, stat } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { resolve, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { Game, clamp } from '../src/engine.js';
import { seededRandom, policyInput, commandTarget, withRules } from './policy.mjs';
import { DEFAULT_STRATEGY, chatMessages, gameObservation } from './llm.mjs';
import { benchmark, LLM_BENCHMARK } from './llm-bench.mjs';
import { readJSON, atomicJSON } from '../server/store.mjs';
const root = fileURLToPath(new URL('../', import.meta.url)), STUDENT_STATES = 20000;
/** One chat example: what the model sees in a state, and what the learned pilot would aim at there. */
export function teacherSample(game, policy) {
  const { targetX, fire } = commandTarget(game, game.player, policy);
  return { messages: [...chatMessages(gameObservation(game), DEFAULT_STRATEGY), { role: 'assistant', content: JSON.stringify({ targetX: Math.round(clamp(targetX, 32, 928)), fire, dodge: true }) }] };
}
export function teacherRollouts(policy, count, firstSeed) {
  const samples = [];
  for (let seed = firstSeed; samples.length < count; seed++) {
    const game = new Game(seededRandom(seed)); game.reset();
    // One sample per second keeps consecutive examples from being near-duplicates.
    for (let tick = 0; tick < 300 * 120 && game.state === 'playing' && samples.length < count; tick++) {
      if (tick % 120 === 60 && game.enemies.length) samples.push(teacherSample(game, policy));
      game.update(1 / 120, policyInput(game, game.player, policy)); game.events.length = 0;
    }
  }
  return samples;
}
function run(command, args) {
  console.log(`$ ${[command, ...args].join(' ')}`);
  return new Promise((done, fail) => spawn(command, args, { stdio: 'inherit', cwd: root }).on('error', fail)
    .on('exit', code => code === 0 ? done() : fail(new Error(`${command} exited with code ${code}`))));
}
async function ollama(baseURL, path, body, method = 'POST') {
  const response = await fetch(new URL(path, baseURL), { method, headers: { 'Content-Type': 'application/json' }, body: body && JSON.stringify(body) });
  const text = await response.text(); if (!response.ok) throw new Error(`Ollama ${path}: ${text}`); return text ? JSON.parse(text) : null;
}
const lines = async path => (await readFile(path, 'utf8').catch(() => '')).split('\n').filter(Boolean);
const shuffle = (items, random) => { for (let i = items.length - 1; i > 0; i--) { const j = Math.floor(random() * (i + 1)); [items[i], items[j]] = [items[j], items[i]]; } return items; };
/** Teach the language model to aim like the learned pilot; the candidate replaces the champion only by scoring higher on the LLM benchmark. */
export async function distill(directory, { samples = 6000, iters = 600, batch = 8, learningRate = 1e-4, layers = 16, games = 8, name = 'space-pilot', base = 'Qwen/Qwen2.5-0.5B-Instruct',
  reference = 'qwen2.5:0.5b', baseURL = 'http://127.0.0.1:11434', python = join(root, '.venv', 'bin', 'python'), ollamaBin = 'ollama', keep = false } = {}) {
  const folder = join(directory, 'llm'), statePath = join(folder, 'state.json'), studentStates = join(folder, 'student-states.jsonl');
  const params = (await readJSON(join(directory, 'policy.json'), null))?.params;
  if (!params) throw new Error('No learned policy to learn from; run npm run train first');
  const policy = withRules(params);
  const state = await readJSON(statePath, { runs: 0, baseline: null, champion: null }), number = state.runs + 1, runDir = join(folder, 'runs', String(number).padStart(4, '0'));
  const dataDir = join(runDir, 'data'), adapter = join(runDir, 'adapter'), fused = join(runDir, 'fused'), gguf = join(runDir, 'model.gguf'), random = seededRandom(number);
  await mkdir(dataDir, { recursive: true });
  const bench = model => benchmark(model, { policy, reflex: policy, seeds: Array.from({ length: games }, (_, i) => 700001 + i), baseURL });
  if (state.baseline?.version !== LLM_BENCHMARK.version) {
    // A new benchmark or prompt invalidates old scores, and states recorded with the old prompt no longer match what the model sees.
    console.log(`Benchmarking ${reference}${state.champion ? ` and ${state.champion.model}` : ''} as the level to beat…`);
    state.baseline = await bench(reference); if (state.champion) state.champion.result = await bench(state.champion.model);
    await rm(studentStates, { force: true }); await atomicJSON(statePath, state);
  }
  // States the previous champions actually reached, labelled by the teacher, teach recovery from the model's own mistakes.
  const reached = shuffle((await lines(studentStates)).map(line => JSON.parse(line)), random).slice(0, Math.round(samples * .3));
  const examples = shuffle([...teacherRollouts(policy, samples - reached.length, 2e6 + number * 1e4), ...reached], random), valid = Math.max(20, Math.round(examples.length * .1));
  await writeFile(join(dataDir, 'valid.jsonl'), examples.slice(0, valid).map(e => JSON.stringify(e)).join('\n') + '\n');
  await writeFile(join(dataDir, 'train.jsonl'), examples.slice(valid).map(e => JSON.stringify(e)).join('\n') + '\n');
  console.log(`Run ${number}: ${examples.length} examples (${reached.length} from states the model reached)`);
  const resume = state.champion?.adapter && await stat(join(state.champion.adapter, 'adapters.safetensors')).catch(() => null) ? ['--resume-adapter-file', join(state.champion.adapter, 'adapters.safetensors')] : [];
  await run(python, ['-m', 'mlx_lm', 'lora', '--model', base, '--train', '--data', dataDir, '--adapter-path', adapter, '--iters', String(iters), '--batch-size', String(batch),
    '--learning-rate', String(learningRate), '--num-layers', String(layers), '--mask-prompt', '--steps-per-report', '50', '--steps-per-eval', '200', '--val-batches', '10', '--seed', String(number), ...resume]);
  await run(python, ['-m', 'mlx_lm', 'fuse', '--model', base, '--adapter-path', adapter, '--save-path', fused]);
  const show = await ollama(baseURL, '/api/show', { model: reference }), blob = show.modelfile.match(/^FROM (.+)$/m)?.[1];
  if (!blob?.startsWith('/')) throw new Error(`Cannot find the local GGUF file of ${reference}; Ollama must run on this machine`);
  await run(python, [join(root, 'agents', 'export_gguf.py'), fused, blob, gguf]);
  await writeFile(join(runDir, 'Modelfile'), `FROM ./model.gguf\nTEMPLATE """${show.template}"""\n`);
  const candidate = `${name}:candidate`; await run(ollamaBin, ['create', candidate, '-f', join(runDir, 'Modelfile')]);
  if (!keep) { await rm(fused, { recursive: true, force: true }); await rm(gguf, { force: true }); }
  console.log(`Benchmarking ${candidate} on ${games} games…`);
  const recorded = [], result = await benchmark(candidate, { policy, reflex: policy, seeds: Array.from({ length: games }, (_, i) => 700001 + i), baseURL, onDecision: game => recorded.push(teacherSample(game, policy)) });
  const kept = [...(await lines(studentStates)), ...recorded.map(e => JSON.stringify(e))].slice(-STUDENT_STATES);
  await writeFile(studentStates, kept.join('\n') + '\n');
  // After a prompt change the base model can outplay an old champion, so the candidate has to beat both.
  const best = [state.baseline, state.champion?.result].filter(Boolean).reduce((a, b) => b.level > a.level ? b : a), promoted = result.level > best.level;
  if (promoted) {
    for (const destination of [`${name}:latest`, `${name}:run-${number}`]) await ollama(baseURL, '/api/copy', { source: candidate, destination });
    state.champion = { model: `${name}:latest`, run: number, adapter, result, promotedAt: new Date().toISOString() };
  }
  await ollama(baseURL, '/api/delete', { model: candidate }, 'DELETE');
  state.runs = number; await atomicJSON(statePath, state);
  const entry = { run: number, examples: examples.length, fromStudent: reached.length, iters, resumed: resume.length > 0, result, best: best.level, promoted, at: new Date().toISOString() };
  await appendFile(join(folder, 'history.jsonl'), JSON.stringify(entry) + '\n');
  return { ...entry, champion: state.champion?.result?.level ?? null, baseline: state.baseline.level };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values } = parseArgs({ options: { samples: { type: 'string', default: '6000' }, iters: { type: 'string', default: '600' }, games: { type: 'string', default: '8' }, runs: { type: 'string', default: '1' }, keep: { type: 'boolean' } } });
  try {
    const directory = resolve(process.env.DATA_DIR || '.data');
    for (let i = 0; i < Number(values.runs); i++) {
      const result = await distill(directory, { samples: Number(values.samples), iters: Number(values.iters), games: Number(values.games), keep: values.keep,
        baseURL: process.env.OLLAMA_BASE_URL || 'http://127.0.0.1:11434', python: process.env.MLX_PYTHON || undefined, ollamaBin: process.env.OLLAMA_BIN || 'ollama' });
      console.log(`Run ${result.run}: level ${result.result.level.toFixed(2)} in ${result.result.seconds.toFixed(0)} s vs best ${result.best.toFixed(2)} · ${result.promoted ? 'NEW CHAMPION → space-pilot:latest' : 'kept the current champion'} · base model ${result.baseline.toFixed(2)}`);
    }
  } catch (error) { console.error(error.message); process.exitCode = 1; }
}
