import { parseArgs } from 'node:util';
import { appendFile, mkdir } from 'node:fs/promises';
import { resolve, join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { performance } from 'node:perf_hooks';
import { Game } from '../src/engine.js';
import { pilotInput } from '../src/pilot.js';
import { DEFAULT_POLICY, seededRandom, policyInput, commandTarget, levelProgress, withRules } from './policy.mjs';
import { ACTION_FORMAT, DEFAULT_STRATEGY, chatMessages, gameObservation, validCommand } from './llm.mjs';
import { readJSON } from '../server/store.mjs';
/** The game waits for every model decision, so results measure play rather than inference latency.
 * Games run until they are lost (or the time cap); the main result is the level reached. */
// Version 4: the reflexes dodge exactly with a half-step deadband, and the learned pilot follows the drop rules.
// Version 5: a command aimed at a drop is collected at the last moment by the reflexes.
export const LLM_BENCHMARK = Object.freeze({ version: 5, seeds: Object.freeze(Array.from({ length: 8 }, (_, i) => 700001 + i)), seconds: 300, interval: .25 });
export function ollamaDecider(model, { baseURL = 'http://127.0.0.1:11434', strategy = DEFAULT_STRATEGY, timeoutMs = 60000 } = {}) {
  return async game => {
    const response = await fetch(new URL('/api/chat', baseURL), { method: 'POST', headers: { 'Content-Type': 'application/json' }, signal: AbortSignal.timeout(timeoutMs),
      body: JSON.stringify({ model, stream: false, format: ACTION_FORMAT, messages: chatMessages(gameObservation(game), strategy), options: { temperature: 0, seed: 1, num_predict: 80, num_ctx: 2048 } }) });
    const data = await response.json(); if (!response.ok) throw new Error(data.error || `Ollama returned HTTP ${response.status}`);
    return validCommand(JSON.parse(data.message.content));
  };
}
/** heuristic | learned | oracle (the learned policy's targets through the model's command path) | <Ollama model>. */
export function controller(name, { policy = DEFAULT_POLICY, ...options } = {}) {
  if (name === 'heuristic') return { input: game => pilotInput(game) };
  if (name === 'learned') return { input: game => policyInput(game, game.player, policy) };
  if (name === 'oracle') return { decide: async game => ({ ...commandTarget(game, game.player, policy), dodge: true }) };
  return { decide: ollamaDecider(name, options) };
}
export async function playGame(seed, control, { seconds = LLM_BENCHMARK.seconds, interval = LLM_BENCHMARK.interval, reflex = DEFAULT_POLICY, onDecision } = {}) {
  const game = new Game(seededRandom(seed)), every = Math.max(1, Math.round(interval * 120)); game.reset();
  let command = null, decisions = 0, errors = 0, waiting = 0, lives = 0, triples = 0;
  for (let tick = 0; tick < seconds * 120 && game.state === 'playing'; tick++) {
    if (control.decide && tick % every === 0) {
      // Like the arena, a failed decision keeps the previous command and the local pilot covers a missing one.
      onDecision?.(game); const started = performance.now(); try { command = await control.decide(game); } catch { errors++; } waiting += performance.now() - started; decisions++;
    }
    game.update(1 / 120, control.decide ? command ? policyInput(game, game.player, reflex, command) : pilotInput(game) : control.input(game));
    for (const event of game.events.splice(0)) if (event.type === 'power') event.power === 'shield' ? lives++ : triples++;
  }
  return { seed, level: levelProgress(game), seconds: game.time, score: game.score, lives, triples, decisions, errors, latencyMs: decisions ? waiting / decisions : 0 };
}
export async function benchmark(name, { seeds = LLM_BENCHMARK.seeds, parallel = 4, ...options } = {}) {
  const control = controller(name, options), games = [], queue = [...seeds];
  await Promise.all(Array.from({ length: Math.min(parallel, seeds.length) }, async () => { while (queue.length) games.push(await playGame(queue.shift(), control, options)); }));
  const mean = key => games.reduce((sum, game) => sum + game[key], 0) / games.length;
  return { name, version: LLM_BENCHMARK.version, games: games.length, level: mean('level'), seconds: mean('seconds'), score: mean('score'), lives: mean('lives'), triples: mean('triples'),
    errors: games.reduce((sum, game) => sum + game.errors, 0), decisions: games.reduce((sum, game) => sum + game.decisions, 0), latencyMs: mean('latencyMs') };
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { games: { type: 'string', default: String(LLM_BENCHMARK.seeds.length) }, seconds: { type: 'string', default: String(LLM_BENCHMARK.seconds) }, parallel: { type: 'string', default: '4' }, 'first-seed': { type: 'string', default: '700001' } } });
  const directory = resolve(process.env.DATA_DIR || '.data'), policy = withRules((await readJSON(join(directory, 'policy.json'), null))?.params);
  const games = Number(values.games), options = { policy, reflex: policy, seconds: Number(values.seconds), parallel: Number(values.parallel), baseURL: process.env.OLLAMA_BASE_URL,
    seeds: Array.from({ length: games }, (_, i) => Number(values['first-seed']) + i) };
  await mkdir(join(directory, 'llm'), { recursive: true });
  for (const name of positionals.length ? positionals : ['heuristic', 'learned', 'oracle', 'qwen2.5:0.5b']) {
    const started = performance.now(), result = await benchmark(name, options);
    console.log(`${name.padEnd(22)} level ${result.level.toFixed(2).padStart(5)} · ${result.seconds.toFixed(0).padStart(3)} s · score ${result.score.toFixed(0).padStart(6)} · picked ${result.lives.toFixed(1)} + and ${result.triples.toFixed(1)} ϟ per game`
      + (result.decisions ? ` · invalid ${result.errors}/${result.decisions} · ${result.latencyMs.toFixed(0)} ms/decision` : '') + ` · ${((performance.now() - started) / 1000).toFixed(0)} s`);
    await appendFile(join(directory, 'llm', 'benchmarks.jsonl'), JSON.stringify({ ...result, at: new Date().toISOString(), limitSeconds: options.seconds }) + '\n');
  }
}
