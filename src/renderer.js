import { CanvasRenderer } from './canvas-renderer.js';
import { WebGLRenderer } from './webgl-renderer.js';
import { QualityController } from './quality.js';

export class Renderer {
  constructor(canvas, { backend = new URLSearchParams(window.location.search).get('renderer') || 'auto' } = {}) {
    this.quality = new QualityController(); this.preference = backend; this.slowWindows = 0; this.checked = 0;
    try {
      const gl = backend === 'canvas2d' ? null : canvas.getContext('webgl', { alpha: false, antialias: false, depth: false, stencil: false, powerPreference: 'high-performance' });
      if (gl) {
        const debug = gl.getExtension('WEBGL_debug_renderer_info');
        const driver = debug ? gl.getParameter(debug.UNMASKED_RENDERER_WEBGL) : '';
        if (backend === 'auto' && /swiftshader|llvmpipe|softpipe|software|lavapipe/i.test(driver)) {
          this.reason = 'software-gpu';
          gl.getExtension('WEBGL_lose_context')?.loseContext();
        } else { this.backend = new WebGLRenderer(canvas, gl); this.name = 'webgl'; }
      }
    } catch { this.reason = 'webgl-init-failed'; }
    if (!this.backend) this.useCanvas(canvas);
  }
  useCanvas(canvas) {
    const focused = document.activeElement === canvas;
    this.backend?.dispose?.();
    // A canvas cannot switch context type; keep its id, sizing and keyboard focus.
    const replacement = canvas.cloneNode(); canvas.replaceWith(replacement);
    this.backend = new CanvasRenderer(replacement); this.backend.setQuality(this.quality.level); this.name = 'canvas2d';
    if (focused) replacement.focus({ preventScroll: true });
  }
  recordFrame(timestamp, active) {
    if (this.quality.sample(timestamp, active)) this.backend.setQuality(this.quality.level);
    if (!active) { this.slowWindows = 0; this.checked = timestamp; return; }
    if (timestamp - this.checked < 1000) return;
    this.checked = timestamp;
    if (this.name === 'webgl' && this.preference === 'auto' && this.quality.level === 0 && this.quality.fps > 0 && this.quality.fps < 45) {
      if (++this.slowWindows >= 3) { this.reason = 'slow-gpu'; this.useCanvas(this.backend.canvas); this.slowWindows = 0; }
    } else this.slowWindows = 0;
  }
  render(game, time) { this.backend.render(game, time); }
  getStats() {
    return { backend: this.name, fps: this.quality.fps, quality: ['low', 'medium', 'high'][this.quality.level],
      width: this.backend.canvas.width, height: this.backend.canvas.height, fallbackReason: this.reason || null,
      drawCalls: this.backend.drawCalls ?? null, quads: this.backend.quads ?? null };
  }
}
