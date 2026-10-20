import { mkdir, appendFile, rename, stat } from 'node:fs/promises';
import { join } from 'node:path';
import { atomicJSON, readJSON } from '../server/store.mjs';
import { createTraining, trainGeneration, gate } from './train.mjs';
const HISTORY_LIMIT = 8 * 1024 * 1024;
export const trainingPaths = directory => ({ policy: join(directory, 'policy.json'), folder: join(directory, 'training'),
  state: join(directory, 'training', 'state.json'), history: join(directory, 'training', 'history.jsonl') });
export async function loadTraining(directory, options = {}) {
  const paths = trainingPaths(directory), state = await readJSON(paths.state, null);
  if (state?.kind === 'policy-training-v2') return state;
  // Warm-start from a policy saved before resumable training existed.
  return createTraining((await readJSON(paths.policy, null))?.params, options);
}
export function policyFile(state) {
  const { champion } = state;
  return { kind: 'evolved-controller-v2', params: champion.params, generation: champion.generation, episodes: state.episodes,
    benchmarkReward: champion.benchmark, baselineReward: state.baseline, benchmark: { games: state.benchmark.seeds.length, seconds: state.benchmark.seconds }, promotedAt: champion.promotedAt };
}
async function record(paths, previous, state, entry) {
  const saved = await readJSON(paths.state, null);
  if (saved && saved.generation !== previous.generation) throw new Error('Training state was advanced by another training run; start again to continue from it');
  if (state.champion !== previous.champion) await atomicJSON(paths.policy, policyFile(state));
  await atomicJSON(paths.state, state);
  if ((await stat(paths.history).catch(() => null))?.size > HISTORY_LIMIT) await rename(paths.history, paths.history.replace('.jsonl', '.1.jsonl'));
  await appendFile(paths.history, JSON.stringify(entry) + '\n');
}
/** Continue the persisted training run; every generation is checkpointed, so stopping loses at most one. */
export async function runTraining(directory, { generations = Infinity, minutes = Infinity, benchmarkEvery = 5, shouldStop = () => false, benchmark, ...options } = {}, onProgress = () => {}) {
  const paths = trainingPaths(directory); await mkdir(paths.folder, { recursive: true });
  let state = await loadTraining(directory, { benchmark }); const started = Date.now(), first = state.generation; let promotions = 0, last = null;
  for (let run = 1; run <= generations && Date.now() - started < minutes * 60000 && !shouldStop(); run++) {
    const { state: next, entry } = trainGeneration(state, { ...options, benchmark: (state.generation + 1) % benchmarkEvery === 0 || run === generations });
    await record(paths, state, next, entry); state = next; last = entry; promotions += entry.promoted;
    onProgress({ run, generations, ...entry });
    await new Promise(resolve => setImmediate(resolve));
  }
  // A time-limited or interrupted run still gives its latest parent a chance to become champion.
  const final = gate(state);
  if (final.benchmark !== null) {
    const entry = { generation: state.generation, type: 'benchmark', benchmark: final.benchmark, promoted: final.promoted, champion: final.state.champion.benchmark, params: state.parent.params, at: new Date().toISOString() };
    await record(paths, state, final.state, entry); state = final.state; promotions += final.promoted; onProgress({ run: state.generation - first, generations, ...entry });
  }
  return { generation: state.generation, generations: state.generation - first, episodes: state.episodes, promotions, trainingReward: last?.trainingReward ?? null,
    championReward: state.champion.benchmark, championGeneration: state.champion.generation, baselineReward: state.baseline, step: state.step };
}
