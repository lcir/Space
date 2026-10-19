import { Game, clamp } from '../src/engine.js';
import { DEFAULT_POLICY, seededRandom, policyInput, eventReward } from './policy.mjs';
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
export function trainPolicy({ generations = 5, population = 8, seeds = [11, 29, 47], seconds = 45, seed = 123 } = {}, onProgress = () => {}) {
  const random = seededRandom(seed), baseline = evaluatePolicy(DEFAULT_POLICY, seeds, seconds);
  let params = { ...DEFAULT_POLICY }, reward = baseline;
  const bounds = { lead: [0, 1, .25], dodgeWindow: [80, 400, 80], dodgeMargin: [25, 130, 25], targetBias: [-200, 200, 75], fireMargin: [35, 1000, 250] };
  for (let generation = 0; generation < generations; generation++) {
    let best = { params, reward };
    for (let candidate = 0; candidate < population; candidate++) {
      const trial = {};
      for (const [key, [lo, hi, scale]] of Object.entries(bounds)) trial[key] = clamp(params[key] + (random() + random() - 1) * scale, lo, hi);
      const result = evaluatePolicy(trial, seeds, seconds);
      if (result > best.reward) best = { params: trial, reward: result };
    }
    params = best.params; reward = best.reward; onProgress({ generation: generation + 1, generations, reward, baseline });
  }
  const heldOut = [101, 211, 307];
  return { kind: 'evolved-controller-v1', params, baseline, trainingReward: reward,
    validationReward: evaluatePolicy(params, heldOut, seconds), validationBaseline: evaluatePolicy(DEFAULT_POLICY, heldOut, seconds),
    episodes: (1 + generations * population) * seeds.length + heldOut.length * 2, generations, seconds, createdAt: new Date().toISOString() };
}
