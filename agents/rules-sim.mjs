import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { Game } from '../src/engine.js';
import { seededRandom, policyInput, policyTarget, levelProgress, shotThreats, firstCollision } from './policy.mjs';
import { readJSON } from '../server/store.mjs';
// Hit contexts are taken at the last tick when some position was still safe: just before a hit nothing is.
export const CONTEXTS = Object.freeze({ boss: 'boss', multi: '≥2 shots', wall: 'near a wall', pickup: '≤1 s after a pickup', drop: 'aiming at a drop', late: 'trapped <0.1 s before (no time to react)' });
/** One game until it is lost or `seconds` pass, counting drops collected, hits taken and what was going on when the last escape still existed. */
export function simulate(seed, params, seconds) {
  const game = new Game(seededRandom(seed)); game.reset();
  const result = { lives: 0, triples: 0, hits: 0, chasing: 0, chaseTicks: 0, ticks: 0, ...Object.fromEntries(Object.keys(CONTEXTS).map(key => [key, 0])) };
  let lastPickup = -Infinity, safe = null;
  for (let tick = 0; tick < seconds * 120 && game.state === 'playing'; tick++) {
    // The target is computed once and passed as a command, which steers exactly like the automatic path.
    const ship = game.player, target = policyTarget(game, ship, params), chasing = game.drops.some(d => d.x === target.targetX);
    result.chaseTicks += chasing; result.ticks++;
    const threats = shotThreats(game, ship, params.dodgeHorizon, params.safetyMargin);
    if (!threats.length || Array.from({ length: 113 }, (_, i) => 32 + i * 8).some(x => firstCollision(ship, threats, x, ship.invincible) === Infinity))
      safe = { time: game.time, boss: game.enemies.some(e => e.boss), multi: shotThreats(game, ship, params.dodgeHorizon, 0).length >= 2, wall: ship.x < 100 || ship.x > 860, pickup: game.time - lastPickup <= 1, drop: chasing };
    game.update(1 / 120, policyInput(game, ship, params, target));
    for (const e of game.events) {
      if (e.type === 'power') { result[e.power === 'shield' ? 'lives' : 'triples']++; lastPickup = game.time; }
      if (e.type === 'damage') { result.hits++; result.chasing += chasing; const at = { ...safe, late: game.time - (safe?.time ?? 0) < .1 }; for (const key in CONTEXTS) result[key] += !!at[key]; }
    }
    game.events.length = 0;
  }
  return { ...result, level: levelProgress(game), seconds: game.time };
}
if (!isMainThread) parentPort.postMessage(workerData.seeds.map(seed => simulate(seed, workerData.params, workerData.seconds)));
else if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { values, positionals } = parseArgs({ allowPositionals: true, options: { games: { type: 'string', default: '200' }, seconds: { type: 'string', default: '600' }, 'first-seed': { type: 'string', default: '950001' }, parallel: { type: 'string', default: '4' } } });
  const champion = (await readJSON(join(resolve(process.env.DATA_DIR || '.data'), 'policy.json'), null))?.params;
  if (!champion) { console.error('No learned policy; run npm run train first'); process.exit(1); }
  const games = Number(values.games), seconds = Number(values.seconds), parallel = Number(values.parallel), seeds = Array.from({ length: games }, (_, i) => Number(values['first-seed']) + i);
  const pilots = { values: champion, rules: { ...champion, rules: true } }, names = positionals.length ? positionals : Object.keys(pilots);
  if (!(parallel >= 1) || names.some(name => !pilots[name])) { console.error(`Pilots: ${Object.keys(pilots).join(', ')}; --parallel must be at least 1`); process.exit(1); }
  for (const name of names) {
    const started = performance.now(), chunks = Array.from({ length: parallel }, (_, i) => seeds.filter((_, j) => j % parallel === i)).filter(c => c.length);
    const results = (await Promise.all(chunks.map(chunk => new Promise((done, fail) => new Worker(fileURLToPath(import.meta.url), { workerData: { seeds: chunk, params: pilots[name], seconds } }).once('message', done).once('error', fail).once('exit', code => fail(new Error(`Simulation worker exited with code ${code}`))))))).flat();
    const sum = key => results.reduce((total, r) => total + r[key], 0), hits = sum('hits');
    console.log(`${name.padEnd(7)} level ${(sum('level') / games).toFixed(2)} · ${(sum('seconds') / games).toFixed(0)} s · + ${(sum('lives') / games).toFixed(1)} · ϟ ${(sum('triples') / games).toFixed(1)} per game · ${(hits / sum('seconds') * 60).toFixed(2)} hits/min · ${(hits ? sum('chasing') / hits * 100 : 0).toFixed(0)}% of hits while chasing a drop · ${((performance.now() - started) / 1000).toFixed(0)} s`);
    const pct = n => `${(hits ? n / hits * 100 : 0).toFixed(0)}%`;
    console.log(`        hits: ${Object.entries(CONTEXTS).map(([key, label]) => `${label} ${pct(sum(key))}`).join(' · ')} · flying to a drop ${(sum('chaseTicks') / sum('ticks') * 100).toFixed(0)}% of the time`);
  }
}
