import { WIDTH, clamp } from './engine.js';

/** Local heuristic pilot. No model, account or network is required. */
export function pilotInput(game, player = game.player) {
  if (!player || player.lives <= 0) return { left: false, right: false, fire: false };
  const { enemies, shots } = game;
  let target = null, distance = Infinity;
  for (const enemy of enemies) { const d = Math.abs(enemy.x - player.x); if (d < distance) { target = enemy; distance = d; } }
  let destination = target?.x ?? WIDTH / 2;
  if (player.id === 'wingman' && game.player.lives > 0 && Math.abs(destination - game.player.x) < 75) {
    destination = clamp(game.player.x + (game.player.x < WIDTH / 2 ? 110 : -110), 40, WIDTH - 40);
  }
  for (const shot of shots) {
    if (shot.friendly || shot.y >= player.y || shot.y <= player.y - 180 || shot.vy <= 0) continue;
    const impact = shot.x + shot.vx * ((player.y - shot.y) / shot.vy);
    if (Math.abs(impact - player.x) < 45) {
      destination = clamp(player.x + (player.x < impact ? -95 : 95), 40, WIDTH - 40);
      break;
    }
  }
  return {
    left: destination < player.x - 12,
    right: destination > player.x + 12,
    fire: enemies.length > 0,
  };
}

export function combineInput(human, automatic, mode) {
  if (mode === 'ai') return automatic;
  return { ...human };
}
