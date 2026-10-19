import { clamp, invasionSpeed } from '../src/engine.js';
export const DEFAULT_POLICY = Object.freeze({ lead: .25, dodgeWindow: 200, dodgeMargin: 65, targetBias: 0, fireMargin: 1000 });
export function seededRandom(seed) {
  return () => { seed |= 0; seed = seed + 0x6D2B79F5 | 0; let n = Math.imul(seed ^ seed >>> 15, 1 | seed); n = n + Math.imul(n ^ n >>> 7, 61 | n) ^ n; return ((n ^ n >>> 14) >>> 0) / 4294967296; };
}
export function policyInput(game, ship, params = DEFAULT_POLICY, command = null) {
  if (!ship || ship.lives <= 0) return { left: false, right: false, fire: false };
  let targetX = command?.targetX, nearest = Infinity;
  if (!Number.isFinite(targetX)) {
    targetX = 480;
    for (const enemy of game.enemies) {
      const cost = Math.abs(enemy.x - ship.x) - enemy.y * .2 + (enemy.x - 480) * params.targetBias / 500;
      if (cost < nearest) { nearest = cost; targetX = enemy.x + game.direction * invasionSpeed(game.wave) * params.lead; }
    }
  }
  const fire = command ? command.fire !== false : Math.abs(targetX - ship.x) < params.fireMargin;
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
