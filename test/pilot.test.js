import test from 'node:test';
import assert from 'node:assert/strict';
import { Game } from '../src/engine.js';
import { pilotInput, combineInput } from '../src/pilot.js';
test('AI aims toward closest target and fires', () => {
  const g = new Game(); g.reset(); g.enemies = [{ x: 600 }];
  assert.deepEqual(pilotInput(g), { left: false, right: true, fire: true });
});
test('AI dodges a projected hostile shot', () => {
  const g = new Game(); g.reset(); g.enemies = [{ x: 700 }];
  g.shots = [{ x: 490, y: 500, vx: 0, vy: 250, friendly: false }];
  assert.equal(pilotInput(g).left, true);
});
test('coop preserves all human controls for an independent first ship', () => {
  const human = { left: true, right: false, fire: false }, ai = { left: false, right: true, fire: true };
  assert.deepEqual(combineInput(human, ai, 'coop'), human);
  assert.deepEqual(combineInput(human, ai, 'human'), human);
  assert.deepEqual(combineInput(human, ai, 'ai'), ai);
});
