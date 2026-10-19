import test from 'node:test';
import assert from 'node:assert/strict';
import { EnemyGrid } from '../src/collision-grid.js';
import { overlaps } from '../src/engine.js';
test('grid finds the same geometric hit as a full scan across 144 invaders', () => {
  const grid = new EnemyGrid(960, 680);
  const enemies = Array.from({length:144}, (_, i) => ({x:40+i%12*75, y:60+Math.floor(i/12)*45, w:34, h:28, hp:1}));
  grid.build(enemies);
  let linearChecks = 0;
  for (let y = 0; y < 680; y += 17) for (let x = 0; x < 960; x += 19) {
    const shot = {x,y,w:5,h:20};
    assert.equal(grid.find(shot, overlaps), enemies.find(e => { linearChecks++; return overlaps(shot,e); }));
  }
  assert.ok(grid.checks < linearChecks / 10, 'broad phase removes at least 90% of full-scan candidate checks');
});
test('large bosses spanning bins are hit at their edges and dead targets are skipped', () => {
  const grid = new EnemyGrid(960,680), boss = {x:480,y:150,w:130,h:65,hp:3}; grid.build([boss]);
  assert.equal(grid.find({x:540,y:150,w:5,h:20},overlaps),boss);
  boss.hp=0; assert.equal(grid.find({x:540,y:150,w:5,h:20},overlaps),undefined);
  grid.build([]); assert.ok(grid.cells.every(cell => cell.length === 0));
});
