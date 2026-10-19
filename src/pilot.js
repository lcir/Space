import { WIDTH, clamp } from './engine.js';

/** Local heuristic pilot. No model, account or network is required. */
export function pilotInput(game, player = game.player) {
  if (!player || player.lives <= 0) return { left: false, right: false, fire: false };
  const { enemies, shots } = game;
  let target = enemies.reduce((best, e) => !best || Math.abs(e.x - player.x) < Math.abs(best.x - player.x) ? e : best, null);
  let destination = target?.x ?? WIDTH / 2;
  if (player.id === 'wingman' && game.player.lives > 0 && Math.abs(destination - game.player.x) < 75) {
    destination = clamp(game.player.x + (game.player.x < WIDTH / 2 ? 110 : -110), 40, WIDTH - 40);
  }
  const threat = shots.filter(s => !s.friendly && s.y < player.y && s.y > player.y - 180)
    .map(s => ({ shot: s, impact: s.x + s.vx * ((player.y - s.y) / s.vy) }))
    .find(t => Math.abs(t.impact - player.x) < 45);
  if (threat) destination = clamp(player.x + (player.x < threat.impact ? -95 : 95), 40, WIDTH - 40);
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
