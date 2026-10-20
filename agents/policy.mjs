import { clamp, invasionSpeed } from '../src/engine.js';
// Drop values and stickiness default to 0 (ignore drops, re-choose targets freely), the behavior before they existed.
export const DEFAULT_POLICY = Object.freeze({ lead: .25, safetyMargin: 4, dodgeHorizon: 1.2, targetBias: 0, fireMargin: 1000, rapidValue: 0, shieldValue: 0, stickiness: 0 });
const SHIP_SPEED = 520;
const aimed = new WeakMap();
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
/** The position nearest `desired` whose path is clear of every shot arriving within the horizon.
 * If no position is clear, the one whose first collision comes latest. */
export function safeX(game, ship, desired, params = DEFAULT_POLICY) {
  desired = clamp(desired, 32, 928);
  if (ship.invincible > params.dodgeHorizon) return desired;
  const threats = [];
  for (const shot of game.shots) {
    if (shot.friendly || shot.vy <= 0) continue;
    const band = (ship.h + shot.h) / 2, enter = Math.max(0, (ship.y - band - shot.y) / shot.vy), leave = (ship.y + band - shot.y) / shot.vy;
    if (leave > 0 && enter < params.dodgeHorizon) threats.push({ shot, times: [enter, (enter + leave) / 2, leave], reach: (ship.w + shot.w) / 2 + params.safetyMargin });
  }
  if (!threats.length) return desired;
  const collision = x => {
    let first = Infinity;
    for (const { shot, times, reach } of threats) for (const t of times) {
      if (Math.abs(shot.x + shot.vx * t - (ship.x + Math.sign(x - ship.x) * Math.min(SHIP_SPEED * t, Math.abs(x - ship.x)))) < reach) { first = Math.min(first, t); break; }
    }
    return first;
  };
  if (collision(desired) === Infinity) return desired;
  let best = desired, score = -Infinity;
  for (let x = 32; x <= 928; x += 8) {
    const t = collision(x), s = t === Infinity ? 1e6 - Math.abs(x - desired) : t * 1000 - Math.abs(x - desired) * .01;
    if (s > score) { score = s; best = x; }
  }
  return best;
}
export function policyInput(game, ship, params = DEFAULT_POLICY, command = null) {
  if (!ship || ship.lives <= 0) return { left: false, right: false, fire: false };
  const auto = Number.isFinite(command?.targetX) ? null : policyTarget(game, ship, params);
  let targetX = clamp(auto ? auto.targetX : command.targetX, 32, 928);
  const fire = command ? command.fire !== false : auto.fire;
  if (command?.dodge !== false) targetX = safeX(game, ship, targetX, params);
  return { left: targetX < ship.x - 10, right: targetX > ship.x + 10, fire };
}
export function eventReward(event) {
  if (event.type === 'hit') return (event.points || 100) / 25;
  if (event.type === 'damage') return -10;
  if (event.type === 'fire') return -.01;
  return 0;
}
