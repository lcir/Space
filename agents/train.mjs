import { Game, clamp } from '../src/engine.js';
import { DEFAULT_POLICY, seededRandom, policyInput, levelProgress, withRules } from './policy.mjs';
export const BOUNDS = Object.freeze({ lead: [0, 1, .25], safetyMargin: [0, 20, 4], dodgeHorizon: [.3, 2, .3], targetBias: [-200, 200, 75], fireMargin: [35, 1000, 250],
  rapidValue: [0, 600, 150], shieldValue: [0, 600, 150], stickiness: [0, 200, 40] });
// Benchmark seeds never overlap training seeds (1e6 + generation * 16 + i), so promotion is judged on unseen games.
// Games run until they are lost or the time cap; the champion is the policy that reaches the highest level.
// Difficulty stops rising after sector 15, so a strong policy can survive indefinitely and the cap bounds the cost.
// Version 4: exact dodging with a half-step deadband, and the drop rules.
export const BENCHMARK = Object.freeze({ version: 4, seeds: Object.freeze(Array.from({ length: 48 }, (_, i) => 900001 + i)), seconds: 600 });
export const sanitizePolicy = params => Object.fromEntries(Object.entries(BOUNDS).map(([key, [lo, hi]]) => [key, Number.isFinite(params?.[key]) ? clamp(params[key], lo, hi) : DEFAULT_POLICY[key]]));
/** Mean level reached and game length over the benchmark games, flown with the accepted drop rules. */
export function benchmarkPolicy(params, { seeds, seconds }) {
  let level = 0, time = 0, score = 0; params = withRules(params);
  for (const seed of seeds) {
    const game = new Game(seededRandom(seed)); game.reset();
    for (let tick = 0; tick < seconds * 120 && game.state === 'playing'; tick++) { game.update(1 / 120, policyInput(game, game.player, params)); game.events.length = 0; }
    level += levelProgress(game); time += game.time; score += game.score;
  }
  return { level: level / seeds.length, seconds: time / seeds.length, score: score / seeds.length };
}
export function createTraining(params = DEFAULT_POLICY, { seed = 123, benchmark = BENCHMARK } = {}) {
  params = sanitizePolicy(params); benchmark = { version: benchmark.version ?? BENCHMARK.version, seeds: [...benchmark.seeds], seconds: benchmark.seconds };
  const result = benchmarkPolicy(params, benchmark), baseline = benchmarkPolicy(DEFAULT_POLICY, benchmark), now = new Date().toISOString();
  return { kind: 'policy-training-v2', seed, generation: 0, step: 1, episodes: benchmark.seeds.length * 2, benchmark, baseline: baseline.level, baselineSeconds: baseline.seconds,
    parent: { params, benchmark: result.level }, champion: { params, benchmark: result.level, seconds: result.seconds, generation: 0, promotedAt: now }, createdAt: now, updatedAt: now };
}
/** Re-judge a checkpoint made with an older benchmark; new parameters start at their neutral defaults. */
export function migrateTraining(state) {
  if ((state.benchmark.version ?? 1) >= BENCHMARK.version) return state;
  const benchmark = { version: BENCHMARK.version, seeds: [...BENCHMARK.seeds], seconds: BENCHMARK.seconds }, params = sanitizePolicy(state.champion.params);
  const result = benchmarkPolicy(params, benchmark), baseline = benchmarkPolicy(DEFAULT_POLICY, benchmark);
  return { ...state, benchmark, baseline: baseline.level, baselineSeconds: baseline.seconds, step: Math.max(state.step, .5), episodes: state.episodes + benchmark.seeds.length * 2,
    parent: { params, benchmark: result.level }, champion: { ...state.champion, params, benchmark: result.level, seconds: result.seconds }, updatedAt: new Date().toISOString() };
}
/** Benchmark the parent once after it changes; it becomes champion only by beating the current one.
 * Training rewards on a few seeds are noisy, so a parent that loses the benchmark restarts from the champion with a smaller step. */
export function gate(state) {
  if (state.parent.benchmark !== null) return { state, benchmark: null, promoted: false };
  const result = benchmarkPolicy(state.parent.params, state.benchmark), benchmark = result.level, promoted = benchmark > state.champion.benchmark;
  const champion = promoted ? { params: state.parent.params, benchmark, seconds: result.seconds, generation: state.generation, promotedAt: new Date().toISOString() } : state.champion;
  return { benchmark, promoted, state: { ...state, episodes: state.episodes + state.benchmark.seeds.length, champion,
    parent: promoted ? { ...state.parent, benchmark } : { params: champion.params, benchmark: champion.benchmark }, step: promoted ? state.step : Math.max(.05, state.step * .7) } };
}
/** One resumable (1 + population) evolution step on fresh seeds; the state is plain JSON.
 * Fitness is the level reached, the same measure the benchmark promotes champions by. */
export function trainGeneration(state, { population = 8, seeds = 4, seconds = 300, benchmark = false } = {}) {
  const generation = state.generation + 1, random = seededRandom(state.seed * 1000003 + generation);
  const trainingSeeds = Array.from({ length: seeds }, (_, i) => 1e6 + generation * 16 + i), fitness = params => benchmarkPolicy(params, { seeds: trainingSeeds, seconds }).level;
  const parentLevel = fitness(state.parent.params);
  let best = { params: state.parent.params, reward: parentLevel };
  for (let candidate = 0; candidate < population; candidate++) {
    const trial = {};
    for (const [key, [lo, hi, scale]] of Object.entries(BOUNDS)) trial[key] = clamp(state.parent.params[key] + (random() + random() - 1) * scale * state.step, lo, hi);
    const reward = fitness(trial);
    if (reward > best.reward) best = { params: trial, reward };
  }
  const improved = best.params !== state.parent.params;
  // Widen the search while it keeps finding improvements, narrow it as they become rare.
  let next = { ...state, generation, step: clamp(state.step * (improved ? 1.1 : .93), .05, 2), episodes: state.episodes + (population + 1) * seeds,
    parent: improved ? { params: best.params, benchmark: null } : state.parent, updatedAt: new Date().toISOString() };
  const result = benchmark ? gate(next) : { state: next, benchmark: null, promoted: false }; next = result.state;
  return { state: next, entry: { generation, parentLevel, trainingLevel: best.reward, improved, step: next.step, benchmark: result.benchmark, promoted: result.promoted,
    champion: next.champion.benchmark, params: best.params, at: next.updatedAt } };
}
