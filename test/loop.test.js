import test from 'node:test';
import assert from 'node:assert/strict';
import { FixedStepLoop } from '../src/loop.js';
import { Game } from '../src/engine.js';

function simulate(fps) {
  const loop = new FixedStepLoop();
  const game = new Game(() => .5); game.reset();
  for (let frame = 0; frame <= fps; frame++) {
    loop.advance(frame * 1000 / fps, dt => game.update(dt, { left: true, fire: true }));
  }
  return { time: game.time, x: game.player.x, enemies: game.enemies, shots: game.shots, score: game.score };
}
test('15, 30, 60 and 144 FPS advance identical simulation, movement and firing', () => {
  const expected = simulate(60);
  for (const fps of [15, 30, 144]) assert.deepEqual(simulate(fps), expected);
  assert.ok(Math.abs(expected.time - 1) < 1e-9);
});
test('100ms frame advances all elapsed time instead of running at half speed', () => {
  const loop = new FixedStepLoop(); let seconds = 0;
  loop.advance(0, dt => { seconds += dt; });
  assert.equal(loop.advance(100, dt => { seconds += dt; }), 12);
  assert.ok(Math.abs(seconds - .1) < 1e-9);
});
test('long stalls have bounded catch-up and pause drops accumulated debt', () => {
  const loop = new FixedStepLoop(); let seconds = 0;
  const update = dt => { seconds += dt; };
  loop.advance(0, update); assert.equal(loop.advance(10000, update), 30);
  assert.ok(seconds <= .25 + 1e-9);
  loop.advance(20000, update, false); const before = seconds;
  assert.equal(loop.advance(30000, update), 0); assert.equal(seconds, before);
  assert.equal(loop.advance(30000 + 1000 / 60, update), 2);
});
test('irregular frame intervals preserve one second of game time', () => {
  const loop = new FixedStepLoop(); let seconds = 0;
  for (const time of [0, 7, 40, 100, 250, 333, 550, 600, 800, 1000]) loop.advance(time, dt => { seconds += dt; });
  assert.ok(Math.abs(seconds - 1) < 1e-9);
});
