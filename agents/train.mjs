import { Game, clamp } from '../src/engine.js';
import { DEFAULT_POLICY, seededRandom, policyInput, eventReward } from './policy.mjs';
export const BOUNDS = Object.freeze({ lead: [0, 1, .25], dodgeWindow: [80, 400, 80], dodgeMargin: [25, 130, 25], targetBias: [-200, 200, 75], fireMargin: [35, 1000, 250] });
// Benchmark seeds never overlap training seeds (1e6 + generation * 16 + i), so promotion is judged on unseen games.
export const BENCHMARK = Object.freeze({ seeds: Object.freeze(Array.from({ length: 48 }, (_, i) => 900001 + i)), seconds: 300 });
export const sanitizePolicy = params => Object.fromEntries(Object.entries(BOUNDS).map(([key, [lo, hi]]) => [key, Number.isFinite(params?.[key]) ? clamp(params[key], lo, hi) : DEFAULT_POLICY[key]]));
export function evaluatePolicy(params, seeds = [11, 29, 47], seconds = 45) {
  let total = 0;
  for (const seed of seeds) {
    const game = new Game(seededRandom(seed)); game.reset(); let reward = 0;
    for (let tick = 0; tick < seconds * 120 && game.state === 'playing'; tick++) {
      game.update(1 / 120, policyInput(game, game.player, params));
      reward += .03 / 120;
      for (const event of game.events.splice(0)) reward += eventReward(event) + (event.type === 'wave' && event.wave > 1 ? 10 : 0);
    }
    total += reward;
  }
  return total / seeds.length;
}
export function createTraining(params = DEFAULT_POLICY, { seed = 123, benchmark = BENCHMARK } = {}) {
  params = sanitizePolicy(params); benchmark = { seeds: [...benchmark.seeds], seconds: benchmark.seconds };
  const score = evaluatePolicy(params, benchmark.seeds, benchmark.seconds), now = new Date().toISOString();
  return { kind: 'policy-training-v2', seed, generation: 0, step: 1, episodes: benchmark.seeds.length * 2, benchmark,
    baseline: evaluatePolicy(DEFAULT_POLICY, benchmark.seeds, benchmark.seconds),
    parent: { params, benchmark: score }, champion: { params, benchmark: score, generation: 0, promotedAt: now }, createdAt: now, updatedAt: now };
}
/** Benchmark the parent once after it changes; it becomes champion only by beating the current one.
 * Training rewards on a few seeds are noisy, so a parent that loses the benchmark restarts from the champion with a smaller step. */
export function gate(state) {
  if (state.parent.benchmark !== null) return { state, benchmark: null, promoted: false };
  const benchmark = evaluatePolicy(state.parent.params, state.benchmark.seeds, state.benchmark.seconds), promoted = benchmark > state.champion.benchmark;
  const champion = promoted ? { params: state.parent.params, benchmark, generation: state.generation, promotedAt: new Date().toISOString() } : state.champion;
  return { benchmark, promoted, state: { ...state, episodes: state.episodes + state.benchmark.seeds.length, champion,
    parent: promoted ? { ...state.parent, benchmark } : { params: champion.params, benchmark: champion.benchmark }, step: promoted ? state.step : Math.max(.05, state.step * .7) } };
}
/** One resumable (1 + population) evolution step on fresh seeds; the state is plain JSON. */
export function trainGeneration(state, { population = 8, seeds = 4, seconds = 120, benchmark = false } = {}) {
  const generation = state.generation + 1, random = seededRandom(state.seed * 1000003 + generation);
  const trainingSeeds = Array.from({ length: seeds }, (_, i) => 1e6 + generation * 16 + i);
  const parentReward = evaluatePolicy(state.parent.params, trainingSeeds, seconds);
  let best = { params: state.parent.params, reward: parentReward };
  for (let candidate = 0; candidate < population; candidate++) {
    const trial = {};
    for (const [key, [lo, hi, scale]] of Object.entries(BOUNDS)) trial[key] = clamp(state.parent.params[key] + (random() + random() - 1) * scale * state.step, lo, hi);
    const reward = evaluatePolicy(trial, trainingSeeds, seconds);
    if (reward > best.reward) best = { params: trial, reward };
  }
  const improved = best.params !== state.parent.params;
  // Widen the search while it keeps finding improvements, narrow it as they become rare.
  let next = { ...state, generation, step: clamp(state.step * (improved ? 1.1 : .93), .05, 2), episodes: state.episodes + (population + 1) * seeds,
    parent: improved ? { params: best.params, benchmark: null } : state.parent, updatedAt: new Date().toISOString() };
  const result = benchmark ? gate(next) : { state: next, benchmark: null, promoted: false }; next = result.state;
  return { state: next, entry: { generation, parentReward, trainingReward: best.reward, improved, step: next.step, benchmark: result.benchmark, promoted: result.promoted,
    champion: next.champion.benchmark, params: best.params, at: next.updatedAt } };
}
