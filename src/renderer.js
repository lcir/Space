import { WIDTH, HEIGHT } from './engine.js';
function sprite(width, height, draw) {
  const canvas = document.createElement('canvas');
  canvas.width = width * 2; canvas.height = height * 2;
  const context = canvas.getContext('2d'); context.scale(2, 2); draw(context);
  return canvas;
}
const alien = ['00100100','00011000','00111100','01111110','11011011','11111111','10100101','00100100'];
export class Renderer {
  constructor(canvas) {
    this.canvas = canvas; this.ctx = canvas.getContext('2d', { alpha: false });
    // Bake expensive shadows once, not thousands of times on every frame.
    this.aliens = ['#f4ad90', '#b9a6ed', '#78d8df', '#9cf4cb'].map(color => sprite(80, 72, c => {
      c.translate(40, 36); c.shadowColor = color; c.shadowBlur = 12;
      alien.forEach((row, y) => [...row].forEach((pixel, x) => {
        if (pixel !== '1') return;
        c.fillStyle = '#163b4d'; c.fillRect((x - 4) * 4.5 + 2, (y - 4) * 4 + 3, 4, 4);
        c.fillStyle = color; c.fillRect((x - 4) * 4.5, (y - 4) * 4, 4, 3);
      }));
    }));
    this.lasers = ['#b6ffe4', '#b9b0ff', '#ff9b9a'].map(color => sprite(40, 54, c => {
      c.fillStyle = color; c.shadowColor = color; c.shadowBlur = 12; c.fillRect(17, 17, 6, 20);
    }));
    this.mothership = sprite(190, 110, c => {
      c.translate(95, 55); c.shadowColor = '#ff947d'; c.shadowBlur = 22;
      c.fillStyle = '#694658'; c.beginPath(); c.ellipse(0, 0, 68, 26, 0, 0, Math.PI * 2); c.fill();
      c.fillStyle = '#ffae91'; c.beginPath(); c.ellipse(0, -12, 30, 22, 0, Math.PI, Math.PI * 2); c.fill();
    });
    this.background = sprite(WIDTH, HEIGHT, c => this.drawBackground(c));
    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      // Bound fill rate on retina displays and mobile GPUs.
      const dpr = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(1500000 / Math.max(1, rect.width * rect.height)));
      canvas.width = Math.max(1, Math.round(rect.width * dpr));
      canvas.height = Math.max(1, Math.round(rect.height * dpr));
    };
    resize();
    this.resizeObserver = new ResizeObserver(resize); this.resizeObserver.observe(canvas);
    window.addEventListener('resize', resize);
    this.stars = Array.from({ length: 160 }, (_, i) => ({ x: (i * 173.31) % WIDTH, y: (i * 83.17) % HEIGHT, z: .2 + (i % 7) / 7 }));
  }
  render(game, time) {
    const { canvas, ctx: c } = this;
    c.setTransform(canvas.width / WIDTH, 0, 0, canvas.height / HEIGHT, 0, 0);
    c.drawImage(this.background, 0, 0, WIDTH, HEIGHT);
    for (const s of this.stars) { c.globalAlpha = .2 + s.z * .55; c.fillStyle = '#c5e7ff'; c.fillRect(s.x, (s.y + time * (5 + s.z * 13)) % HEIGHT, s.z * 1.7, s.z * 1.7); }
    c.globalAlpha = 1;
    c.strokeStyle = '#4a9fbd12'; c.lineWidth = 1;
    for (let i = 0; i < 7; i++) { const y = 470 + ((i * 31 + time * 18) % 210); c.beginPath(); c.moveTo(0, y); c.lineTo(WIDTH, y); c.stroke(); }
    if (game.state === 'ready') { this.ship(480, 548, time, false); return; }
    for (const e of game.enemies) {
      c.save(); c.translate(e.x, e.y + Math.sin(time * 3 + e.row) * 3);
      if (e.boss) {
        c.drawImage(this.mothership, -95, -55, 190, 110);
        c.shadowBlur = 0; c.fillStyle = '#362c40'; c.fillRect(-65, 40, 130, 4); c.fillStyle = '#ffae91'; c.fillRect(-65, 40, 130 * e.hp / e.maxHp, 4);
      } else {
        c.drawImage(this.aliens[e.row], -40, -36, 80, 72);
      }
      c.restore();
    }
    for (const ship of game.ships) {
      if (ship.lives > 0 && (ship.invincible <= 0 || Math.floor(time * 12) % 2)) this.ship(ship.x, ship.y, time, ship.invincible > 0, ship.id === 'wingman');
    }
    for (const s of game.shots) c.drawImage(this.lasers[s.friendly ? (s.owner === 'wingman' ? 1 : 0) : 2], s.x - 20, s.y - 27, 40, 54);
    for (const d of game.drops) { c.save(); c.translate(d.x, d.y); c.rotate(time); c.strokeStyle = d.type === 'shield' ? '#96c9ff' : '#f4d292'; c.strokeRect(-12, -12, 24, 24); c.restore(); c.fillStyle = '#fff'; c.font = '15px monospace'; c.textAlign = 'center'; c.fillText(d.type === 'shield' ? '+' : 'ϟ', d.x, d.y + 5); }
    for (const p of game.particles) { c.globalAlpha = Math.min(1, p.life * 2); c.fillStyle = p.color; c.fillRect(p.x, p.y, 3, 3); } c.globalAlpha = 1;
  }
  drawBackground(c) {
    c.fillStyle = '#080f20'; c.fillRect(0, 0, WIDTH, HEIGHT);
    const glow = c.createRadialGradient(650, 230, 0, 650, 230, 600);
    glow.addColorStop(0, '#19364b88'); glow.addColorStop(1, '#080f2000'); c.fillStyle = glow; c.fillRect(0, 0, WIDTH, HEIGHT);
    // Shaded orbital body, entirely procedural and available offline.
    c.save(); c.translate(780, 210); c.rotate(-.35);
    const planet = c.createRadialGradient(-35, -40, 3, 0, 0, 115);
    planet.addColorStop(0, '#375564'); planet.addColorStop(.55, '#1d3445'); planet.addColorStop(1, '#0b1327');
    c.fillStyle = planet; c.beginPath(); c.arc(0, 0, 110, 0, Math.PI * 2); c.fill();
    c.strokeStyle = '#83e5d626'; c.lineWidth = 1; c.beginPath(); c.ellipse(0, 0, 165, 32, 0, 0, Math.PI * 2); c.stroke(); c.restore();
    // Perspective runway gives depth without requiring WebGL or downloaded assets.
    c.strokeStyle = '#4a9fbd12'; c.lineWidth = 1;
    for (let i = -8; i <= 8; i++) { c.beginPath(); c.moveTo(480 + i * 28, 470); c.lineTo(480 + i * 180, HEIGHT); c.stroke(); }
  }
  ship(x, y, time, shield, wingman = false) {
    const c = this.ctx; c.save(); c.translate(x, y);
    c.fillStyle = wingman ? '#b9a6ff' : '#a1ffda'; c.shadowColor = c.fillStyle;
    c.beginPath(); c.moveTo(-8, 14); c.lineTo(0, 30 + Math.sin(time * 45) * 8); c.lineTo(8, 14); c.fill(); c.shadowBlur = 0;
    c.fillStyle = '#648fa6'; c.beginPath(); c.moveTo(0, -25); c.lineTo(28, 21); c.lineTo(0, 12); c.lineTo(-28, 21); c.closePath(); c.fill();
    c.fillStyle = '#c9e7eb'; c.beginPath(); c.moveTo(0, -25); c.lineTo(0, 12); c.lineTo(-28, 21); c.closePath(); c.fill();
    c.fillStyle = wingman ? '#b9a6ff' : '#74f7d1'; c.beginPath(); c.moveTo(0, -13); c.lineTo(6, 5); c.lineTo(-6, 5); c.closePath(); c.fill();
    c.fillStyle = wingman ? '#b9a6ff' : '#a1ffda'; c.font = '10px monospace'; c.textAlign = 'center'; c.fillText(wingman ? 'AI / 02' : 'YOU / 01', 0, 52);
    if (shield) { c.strokeStyle = '#9cffe577'; c.beginPath(); c.arc(0, 0, 39, 0, Math.PI * 2); c.stroke(); } c.restore();
  }
}
