/** Fixed 120 Hz simulation, independent of rendering and monitor refresh rate.
 * Catch up up to 250 ms (30 steps), then drop excess debt after long stalls.
 * Pause/resume resets the clock; hidden tabs never fast-forward a mission.
 */
export class FixedStepLoop {
  constructor(step = 1 / 120, maxFrame = .25) {
    this.step = step;
    this.maxFrame = maxFrame;
    this.reset();
  }
  reset() { this.last = null; this.accumulator = 0; }
  advance(timestamp, update, active = true) {
    if (!active) { this.reset(); return 0; }
    if (this.last === null) { this.last = timestamp; return 0; }
    this.accumulator += Math.min(this.maxFrame, Math.max(0, (timestamp - this.last) / 1000));
    this.last = timestamp;
    let steps = 0;
    const limit = Math.ceil(this.maxFrame / this.step);
    while (this.accumulator + 1e-10 >= this.step && steps < limit) {
      update(this.step);
      this.accumulator = Math.max(0, this.accumulator - this.step);
      steps++;
    }
    return steps;
  }
}
