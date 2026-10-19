/** Reused broad-phase bins keep each laser from scanning the entire invasion. */
export class EnemyGrid {
  constructor(width, height, cellSize = 64) {
    this.cellSize = cellSize; this.columns = Math.ceil(width / cellSize); this.rows = Math.ceil(height / cellSize);
    this.cells = Array.from({ length: this.columns * this.rows }, () => []);
    this.checks = 0;
  }
  clear() { for (const cell of this.cells) cell.length = 0; this.checks = 0; }
  column(x) { return Math.max(0, Math.min(this.columns - 1, Math.floor(x / this.cellSize))); }
  row(y) { return Math.max(0, Math.min(this.rows - 1, Math.floor(y / this.cellSize))); }
  build(enemies) {
    this.clear();
    for (const e of enemies) {
      if (e.hp <= 0) continue;
      const left = this.column(e.x - e.w / 2), right = this.column(e.x + e.w / 2);
      const top = this.row(e.y - e.h / 2), bottom = this.row(e.y + e.h / 2);
      for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) this.cells[y * this.columns + x].push(e);
    }
  }
  find(shot, intersects) {
    const left = this.column(shot.x - shot.w / 2), right = this.column(shot.x + shot.w / 2);
    const top = this.row(shot.y - shot.h / 2), bottom = this.row(shot.y + shot.h / 2);
    for (let y = top; y <= bottom; y++) for (let x = left; x <= right; x++) {
      for (const enemy of this.cells[y * this.columns + x]) {
        this.checks++;
        if (enemy.hp > 0 && intersects(shot, enemy)) return enemy;
      }
    }
    return undefined;
  }
}
