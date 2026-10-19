import test from 'node:test';
import assert from 'node:assert/strict';
import { QualityController } from '../src/quality.js';
function sample(q, fps, seconds, start = 0) {
  for (let i = 0; i <= fps * seconds; i++) q.sample(start + i * 1000 / fps, true);
}
test('sustained slow frames lower visual quality within two seconds', () => {
  const q = new QualityController(); sample(q, 25, 3); assert.equal(q.level, 0); assert.equal(q.fps, 25);
});
test('quality only recovers after sustained smooth rendering', () => {
  const q = new QualityController(); q.level = 0;
  sample(q, 60, 2); assert.equal(q.level, 0);
  sample(q, 60, 9, 3000); assert.equal(q.level, 1);
});
test('pause clears frame debt without changing visual quality', () => {
  const q = new QualityController(); sample(q, 60, 1); q.sample(100000, false);
  assert.equal(q.sample(200000, true), false); assert.equal(q.level, 2);
});
