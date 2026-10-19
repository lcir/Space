import test from 'node:test';
import assert from 'node:assert/strict';
import { Game, overlaps } from '../src/engine.js';
const game = () => { const g = new Game(() => .5); g.reset(); return g; };
const advance = (g, seconds, input) => { for (let i = 0; i < Math.ceil(seconds * 60); i++) g.update(1 / 60, input); };
test('mission starts with 36 invaders, three lives, and bounded movement', () => {
  const g = game(); assert.equal(g.enemies.length, 36); assert.equal(g.lives, 3);
  advance(g, 5, { left: true }); assert.equal(g.player.x, 32);
  advance(g, 5, { right: true }); assert.equal(g.player.x, 928);
});
test('pause freezes every simulation timer and resume continues', () => {
  const g = game(); g.togglePause(); const before = JSON.stringify(g);
  advance(g, 3, { fire: true }); assert.equal(JSON.stringify(g), before);
  g.togglePause(); advance(g, .5, { fire: true }); assert.ok(g.time > 0); assert.ok(g.shots.length);
});
test('laser destroys one invader and awards row score', () => {
  const g = game(), e = g.enemies[0];
  g.shots.push({ x: e.x, y: e.y + 12, w: 5, h: 20, vx: 0, vy: -720, friendly: true });
  g.update(1 / 60); assert.equal(g.enemies.length, 35); assert.equal(g.score, 100); assert.equal(g.shots.length, 0);
});
test('damage immunity prevents multiple deaths in one hit window; final death ends game', () => {
  const g = game(); g.invincible = 0; g.damage(); g.damage(); assert.equal(g.lives, 2);
  g.invincible = 0; g.damage(); g.invincible = 0; g.damage(); assert.equal(g.state, 'over');
  const before = g.time; g.update(.05); assert.equal(g.time, before);
  g.reset(); assert.equal(g.score, 0); assert.equal(g.lives, 3); assert.equal(g.wave, 1);
});
test('enemy projectile damages player and is consumed', () => {
  const g = game(); g.invincible = 0;
  g.shots.push({ ...g.player, vx: 0, vy: 0, friendly: false });
  g.update(.01); assert.equal(g.lives, 2); assert.equal(g.shots.length, 0);
});
test('clear sector advances after transition; every fifth sector is a boss', () => {
  const g = game(); g.enemies = []; advance(g, 2); assert.equal(g.wave, 2); assert.equal(g.enemies.length, 36);
  g.wave = 5; g.spawnWave(); assert.equal(g.enemies.length, 1); assert.equal(g.enemies[0].boss, true); assert.ok(g.enemies[0].hp > 1);
});
test('powerups grant three shots and repair capped hull', () => {
  const g = game(); g.drops.push({ ...g.player, type: 'rapid' }); g.update(.01); assert.ok(g.power > 0);
  g.update(.01, { fire: true }); assert.equal(g.shots.filter(s => s.friendly).length, 3);
  g.lives = 2; g.drops.push({ ...g.player, type: 'shield' }); g.update(.01); assert.equal(g.lives, 3);
  g.drops.push({ ...g.player, type: 'shield' }); g.update(.01); assert.equal(g.lives, 3);
});
test('invaders reaching the defense line end the mission', () => {
  const g = game(); g.enemies[0].y = 590; g.update(.01); assert.equal(g.state, 'over'); assert.equal(g.lives, 0);
});
test('edge bounce moves formation down and reverses direction', () => {
  const g = game(); g.enemies[0].x = 920; g.update(.01); assert.equal(g.direction, -1); assert.equal(g.enemies[0].y, 151);
});
test('collision requires both axes, and large time gaps are clamped', () => {
  assert.equal(overlaps({ x: 0, y: 0, w: 10, h: 10 }, { x: 0, y: 50, w: 10, h: 10 }), false);
  const g = game(); g.update(20, { right: true }); assert.ok(g.time <= .05); assert.ok(g.player.x < 500);
});
test('coop ships move and fire independently with separate damage and powerups', () => {
  const g = game(); g.coop = true; g.reset();
  g.update(.05, { left: true, fire: true }, { right: true, fire: true });
  assert.ok(g.player.x < 340); assert.ok(g.wingman.x > 620);
  assert.deepEqual(g.shots.map(s => s.owner).sort(), ['player', 'wingman']);
  g.wingman.invincible = 0; g.damage(g.wingman);
  assert.equal(g.wingman.lives, 2); assert.equal(g.player.lives, 3);
  g.drops.push({ ...g.wingman, type: 'rapid' }); g.update(.01);
  assert.equal(g.wingman.power, 8); assert.equal(g.player.power, 0);
});
test('coop continues when one ship falls; ends after both are lost', () => {
  const g = game(); g.coop = true; g.reset();
  g.player.lives = 1; g.player.invincible = 0; g.damage();
  assert.equal(g.state, 'playing'); assert.equal(g.player.lives, 0);
  const x = g.player.x;
  g.update(.05, { right: true, fire: true }, { left: true, fire: true });
  assert.equal(g.player.x, x); assert.ok(g.shots.every(s => s.owner === 'wingman'));
  g.wingman.lives = 1; g.wingman.invincible = 0; g.damage(g.wingman);
  assert.equal(g.state, 'over');
  g.reset(); assert.equal(g.wingman.lives, 3); assert.equal(g.player.lives, 3);
});
