/** Rendering quality changes never alter physics, enemies, shots or input timing. */
export class QualityController {
  constructor() { this.level = 2; this.reset(); this.fps = 0; }
  reset() { this.last = null; this.elapsed = 0; this.frames = 0; this.goodWindows = 0; }
  sample(timestamp, active) {
    if (!active) { this.reset(); return false; }
    if (this.last === null) { this.last = timestamp; return false; }
    const delta = timestamp - this.last; this.last = timestamp;
    // Tab suspension/long blocking work is not evidence of GPU fill-rate pressure.
    if (delta <= 0 || delta > 250) { this.elapsed = 0; this.frames = 0; return false; }
    this.elapsed += delta; this.frames++;
    if (this.elapsed < 1000) return false;
    this.fps = Math.round(this.frames * 1000 / this.elapsed);
    const old = this.level;
    if (this.fps < 48) { this.level = Math.max(0, this.level - 1); this.goodWindows = 0; }
    else if (this.fps >= 57) {
      if (++this.goodWindows >= 8) { this.level = Math.min(2, this.level + 1); this.goodWindows = 0; }
    } else this.goodWindows = 0;
    this.elapsed = 0; this.frames = 0;
    return old !== this.level;
  }
}
