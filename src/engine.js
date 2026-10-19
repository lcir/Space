export const WIDTH = 960, HEIGHT = 680;
export const clamp = (n, lo, hi) => Math.max(lo, Math.min(hi, n));
export function overlaps(a, b) {
  return Math.abs(a.x - b.x) < (a.w + b.w) / 2 && Math.abs(a.y - b.y) < (a.h + b.h) / 2;
}

/** Pure, fixed-world simulation. Rendering, input and persistence live outside it. */
function createShip(id, x) {
  return { id, x, y: 594, w: 38, h: 30, lives: 3, invincible: 2, power: 0, cooldown: 0 };
}

export class Game {
  get lives() { return this.player.lives; }
  set lives(value) { this.player.lives = value; }
  get invincible() { return this.player.invincible; }
  set invincible(value) { this.player.invincible = value; }
  get power() { return this.player.power; }
  set power(value) { this.player.power = value; }
  get ships() { return [this.player, this.wingman].filter(Boolean); }
  constructor(random = Math.random) { this.random = random; this.state = 'ready'; this.reset(); this.state = 'ready'; }
  reset() {
    this.score = 0; this.wave = 1; this.time = 0;
    this.player = createShip('player', this.coop ? 340 : 480);
    this.wingman = this.coop ? createShip('wingman', 620) : null;
    this.shots = []; this.drops = []; this.particles = []; this.events = [];
    this.transition = 0;
    this.state = 'playing'; this.spawnWave();
  }
  spawnWave() {
    this.direction = 1; this.enemyClock = 1.2; this.enemies = []; this.transition = 0;
    if (this.wave % 5 === 0) {
      this.enemies.push({ x: 480, y: 150, w: 130, h: 65, hp: 24 + this.wave * 2, maxHp: 24 + this.wave * 2, boss: true, row: 0 });
    } else {
      for (let row = 0; row < 4; row++) for (let col = 0; col < 9; col++)
        this.enemies.push({ x: 224 + col * 64, y: 130 + row * 52, w: 34, h: 28, hp: 1, row });
    }
    this.events.push({ type: 'wave', wave: this.wave });
  }
  togglePause() { if (this.state === 'playing') this.state = 'paused'; else if (this.state === 'paused') this.state = 'playing'; }
  burst(x, y, color, count = 18) {
    for (let i = 0; i < count; i++) { const angle = this.random() * Math.PI * 2, speed = 35 + this.random() * 150;
      this.particles.push({ x, y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, life: .3 + this.random() * .5, color }); }
  }
  damage(ship = this.player) {
    if (ship.invincible > 0 || ship.lives <= 0 || this.state !== 'playing') return;
    ship.lives--; ship.invincible = 2; ship.power = 0;
    this.burst(ship.x, ship.y, '#ff8f97', 32); this.events.push({ type: 'damage', ship: ship.id });
    if (this.ships.every(s => s.lives <= 0)) { this.state = 'over'; this.events.push({ type: 'over' }); }
  }
  update(dt, input = {}, wingmanInput = {}) {
    if (this.state !== 'playing') return;
    dt = clamp(dt, 0, .05); this.time += dt;
    for (const ship of this.ships) {
      if (ship.lives <= 0) continue;
      const controls = ship === this.player ? input : wingmanInput;
      ship.cooldown -= dt; ship.invincible -= dt; ship.power = Math.max(0, ship.power - dt);
      ship.x = clamp(ship.x + ((controls.right ? 1 : 0) - (controls.left ? 1 : 0)) * 390 * dt, 32, WIDTH - 32);
      if (controls.fire && ship.cooldown <= 0) {
        ship.cooldown = ship.power > 0 ? .13 : .22;
        for (const vx of ship.power > 0 ? [-110, 0, 110] : [0]) this.shots.push({ x: ship.x, y: ship.y - 24, vx, vy: -720, w: 5, h: 20, friendly: true, owner: ship.id });
        this.events.push({ type: 'fire', ship: ship.id });
      }
    }
    const speed = Math.min(145, 24 + this.wave * 5 + (36 - this.enemies.length) * 1.8);
    if (this.enemies.some(e => e.x + e.w / 2 >= 914 || e.x - e.w / 2 <= 46)) {
      this.direction *= -1;
      for (const e of this.enemies) { e.x = clamp(e.x, 47 + e.w / 2, 913 - e.w / 2); if (!e.boss) e.y += 21; }
    }
    for (const e of this.enemies) {
      e.x += this.direction * speed * dt;
      if (e.y + e.h / 2 >= this.player.y - 20) { for (const ship of this.ships) ship.lives = 0; this.state = 'over'; this.events.push({ type: 'over' }); return; }
    }
    this.enemyClock -= dt;
    if (this.enemyClock <= 0 && this.enemies.length) {
      this.enemyClock = Math.max(.22, 1.05 - this.wave * .065);
      const e = this.enemies[Math.floor(this.random() * this.enemies.length)];
      for (const vx of e.boss ? [-130, 0, 130] : [0]) this.shots.push({ x: e.x, y: e.y + e.h / 2, vx, vy: Math.min(400, 205 + this.wave * 13), w: 8, h: 18, friendly: false });
    }
    for (const shot of this.shots) {
      shot.x += shot.vx * dt; shot.y += shot.vy * dt;
      if (shot.friendly) {
        const target = this.enemies.find(e => e.hp > 0 && overlaps(shot, e));
        if (target) {
          shot.dead = true; target.hp--; this.burst(shot.x, shot.y, '#a1ffda', 5);
          if (target.hp <= 0) {
            this.score += target.boss ? 1000 : (4 - target.row) * 25;
            this.burst(target.x, target.y, target.boss ? '#ffa869' : '#9ef9d2', target.boss ? 60 : 18);
            this.events.push({ type: 'hit' });
            if (this.random() < .12 || target.boss) this.drops.push({ x: target.x, y: target.y, w: 24, h: 24, type: this.random() < .25 ? 'shield' : 'rapid' });
          }
        }
      } else {
        const ship = this.ships.find(s => s.lives > 0 && overlaps(shot, s));
        if (ship) { shot.dead = true; this.damage(ship); }
      }
    }
    this.enemies = this.enemies.filter(e => e.hp > 0);
    this.shots = this.shots.filter(s => !s.dead && s.y > -30 && s.y < HEIGHT + 30 && s.x > -30 && s.x < WIDTH + 30);
    for (const drop of this.drops) {
      drop.y += 110 * dt;
      const ship = this.ships.find(s => s.lives > 0 && overlaps(drop, s));
      if (ship) {
        drop.dead = true;
        if (drop.type === 'shield') { ship.lives = Math.min(3, ship.lives + 1); ship.invincible = 3; } else ship.power = 8;
        this.events.push({ type: 'power', power: drop.type, ship: ship.id });
      }
    }
    this.drops = this.drops.filter(d => !d.dead && d.y < HEIGHT + 30);
    for (const p of this.particles) { p.x += p.vx * dt; p.y += p.vy * dt; p.life -= dt; }
    this.particles = this.particles.filter(p => p.life > 0);
    if (!this.enemies.length && this.state === 'playing') {
      this.transition += dt;
      if (this.transition > 1.8) { this.wave++; this.shots = []; for (const ship of this.ships) ship.invincible = 2; this.spawnWave(); }
    }
  }
}
