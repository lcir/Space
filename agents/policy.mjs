import { clamp, invasionSpeed } from '../src/engine.js';
// Drop values and stickiness default to 0 (ignore drops, re-choose targets freely), the behavior before they existed.
export const DEFAULT_POLICY = Object.freeze({ lead: .25, safetyMargin: 4, dodgeHorizon: 1.2, targetBias: 0, fireMargin: 1000, rapidValue: 0, shieldValue: 0, stickiness: 0 });
const SHIP_SPEED = 520;
/** The drop rules accepted so far by `npm run sim:rules` experiments (docs/LEARNING.md). */
export const RULES = Object.freeze({ rules: true, tripleRefresh: 5, pickupSlack: 0 });
/** How every learned pilot flies: trained parameters plus the accepted drop rules, which are not trained. */
export const withRules = params => ({ ...(params || DEFAULT_POLICY), ...RULES });
const aimed = new WeakMap(), tracked = new WeakMap();
/** Continuous level: 0 at the start, 1 when sector 1 is cleared, 6.5 halfway through sector 7. */
export function levelProgress(game) {
  const boss = game.enemies.find(enemy => enemy.boss);
  return game.wave - (boss ? boss.hp / boss.maxHp : game.enemies.length / 36);
}
export function seededRandom(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let n = Math.imul(seed ^ seed >>> 15, 1 | seed); n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n; return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}
/** Where the policy aims before dodging; also the teacher's answer when distilling it into a language model. */
export function policyTarget(game, ship, params = DEFAULT_POLICY) {
  if (params.rules) return ruleTarget(game, ship, params);
  const cost = enemy => Math.abs(enemy.x - ship.x) - enemy.y * .2 + (enemy.x - 480) * params.targetBias / 500;
  let target = null, nearest = Infinity;
  for (const enemy of game.enemies) { const c = cost(enemy); if (c < nearest) { nearest = c; target = enemy; } }
  // Re-choosing every tick made the ship hop between enemies as its own movement changed their costs.
  const kept = game.enemies.find(enemy => enemy.id === aimed.get(ship));
  if (kept && cost(kept) < nearest + params.stickiness) { target = kept; nearest = cost(kept); }
  aimed.set(ship, target?.id);
  let targetX = target ? target.x + game.direction * invasionSpeed(game.wave) * params.lead : 480;
  // A drop is worth a detour of its value in pixels, but only if the ship can get under it before it lands.
  for (const drop of game.drops || []) {
    const value = drop.type === 'shield' ? params.shieldValue * (ship.lives < 3 ? 1 : .25) : params.rapidValue * (ship.power > 1 ? .25 : 1);
    const distance = Math.abs(drop.x - ship.x);
    if (!(value > 0) || drop.y >= ship.y || distance / SHIP_SPEED > (ship.y - drop.y) / 110) continue;
    if (distance - value < nearest) { nearest = distance - value; targetX = drop.x; }
  }
  return { targetX, fire: Math.abs(targetX - ship.x) < params.fireMargin };
}
/** Fixed priorities: a + whenever it is safe (it always shields, and repairs a missing life; at full lives only within `shieldAtFull` pixels), then ϟ when at most `tripleRefresh` seconds of it are left, then enemies.
 * A drop is safe when flying under it and waiting until it is caught is hit by no known shot; hits while invincible do not count. */
export function ruleTarget(game, ship, params) {
  for (const [type, detour] of [['shield', ship.lives < 3 ? Infinity : params.shieldAtFull ?? Infinity], ['rapid', ship.power <= (params.tripleRefresh || 0) ? Infinity : -1]]) {
    const drops = (game.drops || []).filter(d => d.type === type && d.y < ship.y && Math.abs(d.x - ship.x) <= detour && Math.abs(d.x - ship.x) / SHIP_SPEED <= (ship.y - d.y) / 110).sort((a, b) => Math.abs(a.x - ship.x) - Math.abs(b.x - ship.x));
    for (const drop of drops) {
      // With `pickupSlack`, keep shooting until flying under the drop leaves only that many seconds to spare.
      // Every enemy fires equally often, so a drop under a full column is likelier to be hit by a shot not yet fired.
      if (params.columnLimit > 0 && game.enemies.filter(e => Math.abs(e.x - drop.x) < (ship.w + 8) / 2 + params.safetyMargin).length >= params.columnLimit) continue;
      if (params.pickupSlack >= 0 && (ship.y - (ship.h + drop.h) / 2 - drop.y) / 110 - Math.abs(drop.x - ship.x) / SHIP_SPEED > params.pickupSlack) continue;
      const threats = shotThreats(game, ship, Math.max(params.dodgeHorizon, (ship.y - drop.y) / 110), params.safetyMargin);
      if (firstCollision(ship, threats, drop.x, ship.invincible) === Infinity && (!params.escapeCheck || canEscape(game, ship, drop, params))) return { targetX: drop.x, fire: Math.abs(drop.x - ship.x) < params.fireMargin, reason: type === 'shield' ? 'life' : 'triple' };
    }
  }
  return { ...policyTarget(game, ship, { ...params, rules: false, rapidValue: 0, shieldValue: 0 }), reason: 'enemy' };
}
const GRID = Array.from({ length: 113 }, (_, i) => 32 + i * 8);
/** Whether, just after catching `drop`, some position can still be reached before the known shots arrive; a + makes the ship invulnerable for 3 seconds. */
export function canEscape(game, ship, drop, params) {
  const t = Math.max(0, (ship.y - (ship.h + drop.h) / 2 - drop.y) / 110), shots = game.shots.map(s => ({ ...s, x: s.x + s.vx * t, y: s.y + s.vy * t }));
  const caught = { ...ship, x: drop.x, invincible: drop.type === 'shield' ? 3 : Math.max(0, ship.invincible - t) }, threats = shotThreats({ shots }, caught, params.dodgeHorizon, params.safetyMargin);
  return GRID.some(x => firstCollision(caught, threats, x, caught.invincible) === Infinity);
}
/** Enemy shots that cross the ship's row within `horizon` seconds, with the times they enter, pass and leave it. */
export function shotThreats(game, ship, horizon, margin) {
  const threats = [];
  for (const shot of game.shots) {
    if (shot.friendly || shot.vy <= 0) continue;
    const band = (ship.h + shot.h) / 2, enter = Math.max(0, (ship.y - band - shot.y) / shot.vy), leave = (ship.y + band - shot.y) / shot.vy;
    if (leave > 0 && enter < horizon) threats.push({ shot, enter, leave, reach: (ship.w + shot.w) / 2 + margin });
  }
  return threats;
}
/** Seconds until the first hit no earlier than `after` if the ship flies to `x` at full speed and stays there; Infinity if none. */
export function firstCollision(ship, threats, x, after = 0) {
  const stop = Math.abs(x - ship.x) / SHIP_SPEED, v = Math.sign(x - ship.x) * SHIP_SPEED;
  let first = Infinity;
  // The horizontal gap is linear while the ship flies and again after it stops, so the exact first time it is within reach is solvable.
  for (const { shot, enter, leave, reach } of threats) for (const [a, b, gap, rate] of [[0, stop, shot.x - ship.x, shot.vx - v], [stop, Infinity, shot.x - x, shot.vx]]) {
    const from = Math.max(a, enter, after), to = Math.min(b, leave, first);
    if (from > to) continue;
    const g = gap + rate * from, t = Math.abs(g) < reach ? from : g * rate < 0 ? from + (Math.abs(g) - reach) / Math.abs(rate) : Infinity;
    if (t <= to) first = t;
  }
  return first;
}
/** The position nearest `desired` whose path is clear of every shot arriving within the horizon.
 * If no position is clear, the one whose first collision comes latest. */
export function safeX(game, ship, desired, params = DEFAULT_POLICY) {
  desired = clamp(desired, 32, 928);
  if (ship.invincible > params.dodgeHorizon) return desired;
  const threats = shotThreats(game, ship, params.dodgeHorizon, params.safetyMargin);
  if (!threats.length) return desired;
  const collision = x => firstCollision(ship, threats, x);
  if (collision(desired) === Infinity) return desired;
  let best = desired, score = -Infinity;
  for (let x = 32; x <= 928; x += 8) {
    const t = collision(x), s = t === Infinity ? 1e6 - Math.abs(x - desired) : t * 1000 - Math.abs(x - desired) * .01;
    if (s > score) { score = s; best = x; }
  }
  return best;
}
/** What a command should name: the enemy to shoot, since `policyInput` collects drops by the rules itself. */
export const commandTarget = (game, ship, params) => policyTarget(game, ship, { ...params, rules: false, rapidValue: 0, shieldValue: 0 });
export function policyInput(game, ship, params = DEFAULT_POLICY, command = null) {
  if (!ship || ship.lives <= 0) return { left: false, right: false, fire: false };
  const auto = Number.isFinite(command?.targetX) ? null : policyTarget(game, ship, params);
  let targetX = clamp(auto ? auto.targetX : command.targetX, 32, 928);
  const fire = command ? command.fire !== false : auto.fire;
  // Like dodging, drops belong to the reflexes: a model decides every few hundred milliseconds, too coarse to time a pickup or follow the rules' thresholds.
  // A command chooses which enemy to shoot; the rules take a drop when they want one, and a command aimed at a drop they do not want is ignored.
  if (!auto && params.rules && command.dodge !== false) {
    // A command names an enemy where it was when the command was sent; the formation keeps moving, so the reflexes follow that enemy until the next command.
    const lead = game.direction * invasionSpeed(game.wave) * params.lead;
    if (!tracked.has(command)) tracked.set(command, game.enemies.reduce((best, e) => Math.abs(e.x + lead - command.targetX) < 40 && (!best || Math.abs(e.x - command.targetX) < Math.abs(best.x - command.targetX)) ? e : best, null)?.id);
    const enemy = game.enemies.find(e => e.id === tracked.get(command));
    if (enemy) targetX = clamp(enemy.x + lead, 32, 928);
    const now = policyTarget(game, ship, params);
    if (now.reason !== 'enemy' || (game.drops || []).some(d => Math.abs(d.x - command.targetX) < 12)) targetX = clamp(now.targetX, 32, 928);
  }
  if (command?.dodge !== false) targetX = safeX(game, ship, targetX, params);
  // Half of one 120 Hz step: the tightest deadband that cannot oscillate, so a safe position a few pixels away is actually reached.
  return { left: targetX < ship.x - SHIP_SPEED / 240, right: targetX > ship.x + SHIP_SPEED / 240, fire };
}
export function eventReward(event) {
  if (event.type === 'hit') return (event.points || 100) / 25;
  if (event.type === 'damage') return -10;
  if (event.type === 'fire') return -.01;
  return 0;
}
