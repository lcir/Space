/** What a language model sees and answers. The live arena, the benchmark and the distillation dataset must share it exactly. */
export const DEFAULT_STRATEGY = 'Aim at the bottom-most invaders. Keep clear of incoming shots.';
export const ACTION_FORMAT = Object.freeze({ type: 'object', properties: { targetX: { type: 'number', minimum: 32, maximum: 928 }, fire: { type: 'boolean' }, dodge: { type: 'boolean' } }, required: ['targetX', 'fire'], additionalProperties: false });
export const systemPrompt = strategy => 'You fly a Space Invaders ship. Enemy entries are [x,y]; incoming shots are [x,y,vx,vy]; direction is the formation movement (1 right, -1 left). Falling drops are [x,y,kind]: life repairs a lost life and shields you, triple gives 8 seconds of triple laser; power is the triple laser time left. Choose targetX (32..928) near a bottom enemy, or under a drop you can reach before it lands; fire=true, dodge=true. Reply only short JSON. Avoid enemy fire. Strategy memory: ' + (strategy || '');
export function compactObservation(observation) {
  const ship = observation[observation.activeShip];
  const targets = observation.enemies.slice().sort((a, b) => (Math.abs(a.x - ship.x) - a.y * .5) - (Math.abs(b.x - ship.x) - b.y * .5)).slice(0, 12);
  return { ship: observation.activeShip, x: Math.round(ship.x), y: ship.y, lives: ship.lives, power: Math.round(ship.power * 10) / 10, direction: observation.direction,
    enemies: targets.map(e => [Math.round(e.x), Math.round(e.y)]), enemyCount: observation.enemies.length,
    incoming: observation.shots.filter(s => !s.friendly).sort((a, b) => Math.abs(a.x - ship.x) - Math.abs(b.x - ship.x)).slice(0, 6).map(s => [Math.round(s.x), Math.round(s.y), s.vx, s.vy]),
    drops: (observation.drops || []).slice().sort((a, b) => Math.abs(a.x - ship.x) - Math.abs(b.x - ship.x)).slice(0, 3).map(d => [Math.round(d.x), Math.round(d.y), d.type === 'shield' ? 'life' : 'triple']), wave: observation.wave };
}
export const gameObservation = (game, activeShip = 'player') => ({ activeShip, player: game.player, wingman: game.wingman, enemies: game.enemies, shots: game.shots, drops: game.drops, wave: game.wave, direction: game.direction });
export const chatMessages = (observation, strategy) => [{ role: 'system', content: systemPrompt(strategy) }, { role: 'user', content: JSON.stringify(compactObservation(observation)) }];
export function validCommand(command) {
  if (!Number.isFinite(command?.targetX) || command.targetX < 32 || command.targetX > 928 || typeof command.fire !== 'boolean') throw new Error('Model returned an invalid action');
  return { targetX: command.targetX, fire: command.fire, dodge: command.dodge !== false };
}
