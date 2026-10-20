import { clamp, invasionSpeed } from '../src/engine.js';
// Drop values default to 0 (ignore drops), which keeps policies trained before drop chasing behaving the same.
export const DEFAULT_POLICY = Object.freeze({ lead: .25, dodgeWindow: 200, dodgeMargin: 65, targetBias: 0, fireMargin: 1000, rapidValue: 0, shieldValue: 0 });
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
  let targetX = 480, nearest = Infinity;
  for (const enemy of game.enemies) {
    const cost = Math.abs(enemy.x - ship.x) - enemy.y * .2 + (enemy.x - 480) * params.targetBias / 500;
    if (cost < nearest) { nearest = cost; targetX = enemy.x + game.direction * invasionSpeed(game.wave) * params.lead; }
  }
  // A drop is worth a detour of its value in pixels, but only if the ship can get under it before it lands.
  for (const drop of game.drops || []) {
    const value = drop.type === 'shield' ? params.shieldValue * (ship.lives < 3 ? 1 : .25) : params.rapidValue * (ship.power > 1 ? .25 : 1);
    const distance = Math.abs(drop.x - ship.x);
    if (!(value > 0) || drop.y >= ship.y || distance / 520 > (ship.y - drop.y) / 110) continue;
    if (distance - value < nearest) { nearest = distance - value; targetX = drop.x; }
  }
  return { targetX, fire: Math.abs(targetX - ship.x) < params.fireMargin };
}
export function policyInput(game, ship, params = DEFAULT_POLICY, command = null) {
  if (!ship || ship.lives <= 0) return { left: false, right: false, fire: false };
  const auto = Number.isFinite(command?.targetX) ? null : policyTarget(game, ship, params);
  let targetX = auto ? auto.targetX : command.targetX;
  const fire = command ? command.fire !== false : auto.fire;
  if (command?.dodge !== false) for (const shot of game.shots) {
    if (shot.friendly || shot.vy <= 0 || shot.y >= ship.y || shot.y < ship.y - params.dodgeWindow) continue;
    const impact = shot.x + shot.vx * (ship.y - shot.y) / shot.vy;
    if (Math.abs(impact - ship.x) < params.dodgeMargin) {
      targetX = ship.x + (ship.x < impact ? -1 : 1) * params.dodgeMargin * 2;
      if (targetX < 32 || targetX > 928) targetX = ship.x + (ship.x < 480 ? 1 : -1) * params.dodgeMargin * 2;
      break;
    }
  }
  targetX = clamp(targetX, 32, 928);
  return { left: targetX < ship.x - 10, right: targetX > ship.x + 10, fire };
}
export function eventReward(event) {
  if (event.type === 'hit') return (event.points || 100) / 25;
  if (event.type === 'damage') return -10;
  if (event.type === 'fire') return -.01;
  return 0;
}
