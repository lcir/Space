import { WIDTH, HEIGHT } from './engine.js';
import { CanvasRenderer } from './canvas-renderer.js';

const sparkColors = { '#ff8f97': [1, .56, .59], '#ffa869': [1, .66, .41] };
const defaultSparkColor = [.63, 1, .85];

// One texture atlas, one streaming vertex buffer, one draw call per frame.
// WebGL 1 supports older mobile GPUs; Canvas 2D is the compatibility fallback.
export class WebGLRenderer {
  constructor(canvas, gl) {
    this.canvas = canvas; this.gl = gl; this.scale = 1; this.lost = false;
    this.vertices = new Float32Array(8192 * 6 * 8);
    this.assets = this.createAtlas(); this.initialize();
    this.resize = () => {
      const rect = canvas.getBoundingClientRect();
      const ratio = Math.min(window.devicePixelRatio || 1, this.scale, Math.sqrt(900000 / Math.max(1, rect.width * rect.height)));
      const width = Math.max(1, Math.round(rect.width * ratio)), height = Math.max(1, Math.round(rect.height * ratio));
      if (canvas.width !== width || canvas.height !== height) { canvas.width = width; canvas.height = height; }
    };
    this.resize(); this.resizeObserver = new ResizeObserver(this.resize); this.resizeObserver.observe(canvas);
    window.addEventListener('resize', this.resize);
    canvas.addEventListener('webglcontextlost', event => { event.preventDefault(); this.lost = true; });
    canvas.addEventListener('webglcontextrestored', () => { this.initialize(); this.lost = false; });
  }
  createAtlas() {
    const atlas = document.createElement('canvas'); atlas.width = 2048; atlas.height = 1024;
    const ctx = atlas.getContext('2d'), assets = {};
    let x = 0, y = 0, rowHeight = 0;
    const add = (name, image, width, height) => {
      if (x + width + 2 > atlas.width) { x = 0; y += rowHeight + 2; rowHeight = 0; }
      if (y + height + 2 > atlas.height) throw new Error('Sprite atlas capacity exceeded');
      ctx.drawImage(image, x, y, width, height);
      assets[name] = { x, y, width, height };
      x += width + 2; rowHeight = Math.max(rowHeight, height);
    };
    const source = new CanvasRenderer(document.createElement('canvas'), { assetsOnly: true });
    add('background', source.background, WIDTH, HEIGHT);
    source.aliens.forEach((image, i) => add('alien' + i, image, 80, 72));
    source.lasers.forEach((image, i) => add('laser' + i, image, 40, 54));
    add('boss', source.mothership, 190, 110);
    for (let side = 0; side < 2; side++) for (let shield = 0; shield < 2; shield++) {
      const image = document.createElement('canvas'); image.width = 100; image.height = 120;
      source.ctx = image.getContext('2d'); source.ship(50, 45, 0, shield, side);
      add(`ship${side}${shield}`, image, 100, 120);
    }
    for (const type of ['rapid', 'shield']) {
      const image = document.createElement('canvas'); image.width = 40; image.height = 40;
      const c = image.getContext('2d'); c.strokeStyle = type === 'shield' ? '#96c9ff' : '#f4d292';
      c.strokeRect(7, 7, 26, 26); c.font = '18px monospace'; c.fillStyle = '#fff'; c.textAlign = 'center'; c.fillText(type === 'shield' ? '+' : 'ϟ', 20, 26);
      add(type, image, 40, 40);
    }
    const white = document.createElement('canvas'); white.width = 4; white.height = 4;
    const c = white.getContext('2d'); c.fillStyle = '#fff'; c.fillRect(0, 0, 4, 4); add('white', white, 4, 4);
    this.atlas = atlas; this.stars = source.stars;
    return assets;
  }
  initialize() {
    const gl = this.gl;
    const shader = (type, code) => {
      const result = gl.createShader(type); gl.shaderSource(result, code); gl.compileShader(result);
      if (!gl.getShaderParameter(result, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(result));
      return result;
    };
    const vertex = shader(gl.VERTEX_SHADER, `
      attribute vec2 a_position; attribute vec2 a_uv; attribute vec4 a_color;
      varying vec2 v_uv; varying vec4 v_color;
      void main() { gl_Position = vec4(a_position.x / 480.0 - 1.0, 1.0 - a_position.y / 340.0, 0.0, 1.0); v_uv = a_uv; v_color = a_color; }
    `);
    const fragment = shader(gl.FRAGMENT_SHADER, `
      precision mediump float;
      uniform sampler2D u_texture; varying vec2 v_uv; varying vec4 v_color;
      void main() { vec4 tex = texture2D(u_texture, v_uv); gl_FragColor = vec4(tex.rgb * v_color.rgb * v_color.a, tex.a * v_color.a); }
    `);
    this.program = gl.createProgram(); gl.attachShader(this.program, vertex); gl.attachShader(this.program, fragment); gl.linkProgram(this.program);
    gl.deleteShader(vertex); gl.deleteShader(fragment);
    if (!gl.getProgramParameter(this.program, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(this.program));
    gl.useProgram(this.program);
    this.buffer = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer); gl.bufferData(gl.ARRAY_BUFFER, this.vertices.byteLength, gl.DYNAMIC_DRAW);
    for (const [name, size, offset] of [['a_position', 2, 0], ['a_uv', 2, 8], ['a_color', 4, 16]]) {
      const location = gl.getAttribLocation(this.program, name); gl.enableVertexAttribArray(location); gl.vertexAttribPointer(location, size, gl.FLOAT, false, 32, offset);
    }
    this.texture = gl.createTexture(); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, this.texture);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, this.atlas);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    gl.uniform1i(gl.getUniformLocation(this.program, 'u_texture'), 0);
    gl.disable(gl.DEPTH_TEST); gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  }
  dispose() {
    this.resizeObserver.disconnect(); window.removeEventListener('resize', this.resize);
    this.gl.deleteBuffer(this.buffer); this.gl.deleteTexture(this.texture); this.gl.deleteProgram(this.program);
    this.gl.getExtension('WEBGL_lose_context')?.loseContext();
  }
  setQuality(level) { this.scale = [.65, .85, 1][level]; this.resize(); }
  quad(name, x, y, width, height, r = 1, g = 1, b = 1, a = 1) {
    const s = this.assets[name];
    if (this.used + 48 > this.vertices.length) return; // Visual overload cannot allocate without limit.
    const u0 = (s.x + .5) / 2048, v0 = (s.y + .5) / 1024, u1 = (s.x + s.width - .5) / 2048, v1 = (s.y + s.height - .5) / 1024;
    this.writeVertex(x, y, u0, v0, r, g, b, a); this.writeVertex(x + width, y, u1, v0, r, g, b, a); this.writeVertex(x, y + height, u0, v1, r, g, b, a);
    this.writeVertex(x, y + height, u0, v1, r, g, b, a); this.writeVertex(x + width, y, u1, v0, r, g, b, a); this.writeVertex(x + width, y + height, u1, v1, r, g, b, a);
  }
  writeVertex(x, y, u, uv, r, g, b, a) {
    const v = this.vertices; let i = this.used;
    v[i++] = x; v[i++] = y; v[i++] = u; v[i++] = uv; v[i++] = r; v[i++] = g; v[i++] = b; v[i++] = a; this.used = i;
  }

  render(game, time) {
    if (this.lost) return;
    this.used = 0; this.quad('background', 0, 0, WIDTH, HEIGHT);
    const stars = this.scale < .8 ? 48 : 96;
    for (let i = 0; i < stars; i++) { const s = this.stars[i]; this.quad('white', s.x, (s.y + time * (5 + s.z * 13)) % HEIGHT, 1 + s.z, 1 + s.z, .77, .91, 1, .2 + s.z * .55); }
    for (let i = 0; i < 7; i++) this.quad('white', 0, 470 + ((i * 31 + time * 18) % 210), WIDTH, 1, .29, .62, .74, .07);
    if (game.state === 'ready') this.quad('ship00', 430, 503, 100, 120);
    else {
      for (const e of game.enemies) {
        const y = e.y + Math.sin(time * 3 + e.row) * 3;
        this.quad(e.boss ? 'boss' : 'alien' + e.row, e.x - (e.boss ? 95 : 40), y - (e.boss ? 55 : 36), e.boss ? 190 : 80, e.boss ? 110 : 72);
        if (e.boss) { this.quad('white', e.x - 65, y + 40, 130, 4, .21, .17, .25); this.quad('white', e.x - 65, y + 40, 130 * e.hp / e.maxHp, 4, 1, .68, .57); }
      }
      for (const ship of game.ships) if (ship.lives > 0 && (ship.invincible <= 0 || Math.floor(time * 12) % 2)) this.quad(`ship${ship.id === 'wingman' ? 1 : 0}${ship.invincible > 0 ? 1 : 0}`, ship.x - 50, ship.y - 45, 100, 120);
      for (const shot of game.shots) this.quad('laser' + (shot.friendly ? (shot.owner === 'wingman' ? 1 : 0) : 2), shot.x - 20, shot.y - 27, 40, 54);
      for (const drop of game.drops) this.quad(drop.type, drop.x - 20, drop.y - 20, 40, 40);
      const particles = game.particles, stride = this.scale < .8 ? 3 : 1;
      for (let i = 0; i < particles.length; i += stride) {
        const p = particles[i]; const color = sparkColors[p.color] || defaultSparkColor;
        this.quad('white', p.x, p.y, 3, 3, color[0], color[1], color[2], Math.min(1, p.life * 2));
      }
    }
    const gl = this.gl;
    gl.viewport(0, 0, this.canvas.width, this.canvas.height);
    gl.useProgram(this.program); gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
    gl.bufferSubData(gl.ARRAY_BUFFER, 0, this.vertices.subarray(0, this.used));
    gl.drawArrays(gl.TRIANGLES, 0, this.used / 8);
    this.drawCalls = 1; this.quads = this.used / 48;
  }
}
