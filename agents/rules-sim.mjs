import { parseArgs } from 'node:util';
import { resolve, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Worker, isMainThread, parentPort, workerData } from 'node:worker_threads';
import { performance } from 'node:perf_hooks';
import { Game } from '../src/engine.js';
import { seededRandom, policyInput, policyTarget, levelProgress } from './policy.mjs';
import { readJSON } from '../server/store.mjs';
/** One game until it is lost or `seconds` pass, counting drops collected and hits taken (and which hits came while flying to a drop). */
export function simulate(seed, params, seconds) {
  const game = new Game(seededRandom(seed)); game.reset();
  const result = { lives: 0, triples: 0, hits: 0, chasing: 0 };
  for (let tick = 0; tick < seconds * 120 && game.state === 'playing'; tick++) {
    // The target is computed once and passed as a command, which steers exactly like the automatic path.
    const target = policyTarget(game, game.player, params), chasing = game.drops.some(d => d.x === target.targetX);
    game.update(1 / 120, policyInput(game, game.player, params, target));
    for (const e of game.events) {
      if (e.type === 'power') result[e.power === 'shield' ? 'lives' : 'triples']++;
      if (e.type === 'damage') { result.hits++; result.chasing += chasing; }
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
  const pilots = { values: champion, rules: { ...champion, rules: true } };
  for (const name of positionals.length ? positionals : Object.keys(pilots)) {
    const started = performance.now(), chunks = Array.from({ length: parallel }, (_, i) => seeds.filter((_, j) => j % parallel === i)).filter(c => c.length);
    const results = (await Promise.all(chunks.map(chunk => new Promise((done, fail) => new Worker(fileURLToPath(import.meta.url), { workerData: { seeds: chunk, params: pilots[name], seconds } }).once('message', done).once('error', fail))))).flat();
    const sum = key => results.reduce((total, r) => total + r[key], 0), hits = sum('hits');
    console.log(`${name.padEnd(7)} level ${(sum('level') / games).toFixed(2)} · ${(sum('seconds') / games).toFixed(0)} s · + ${(sum('lives') / games).toFixed(1)} · ϟ ${(sum('triples') / games).toFixed(1)} per game · ${(hits / sum('seconds') * 60).toFixed(2)} hits/min · ${(hits ? sum('chasing') / hits * 100 : 0).toFixed(0)}% of hits while chasing a drop · ${((performance.now() - started) / 1000).toFixed(0)} s`);
  }
}
