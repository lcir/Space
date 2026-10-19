import { FixedStepLoop } from './loop.js';
import { Game } from './engine.js';
import { Renderer } from './renderer.js';
import { pilotInput } from './pilot.js';

const elements = new Map();
const $ = id => { if (id === 'game') return document.getElementById(id); if (!elements.has(id)) elements.set(id, document.getElementById(id)); return elements.get(id); };
const loop = new FixedStepLoop();
const game = new Game();
const renderer = new Renderer($('game'));
const input = { left: false, right: false, fire: false };
const agentInput = { left: false, right: false, fire: false };
const wingmanAgent = { left: false, right: false, fire: false };
let agentUntil = 0, wingmanUntil = 0, mode = 'human';
let best = 0, noticeUntil = 0, muted = true, audio;
let inputTimestamp = 0, nextHud = 0, nextSave = 0, bestDirty = false;
try { best = Number(localStorage.getItem('space-best')) || 0; } catch { /* Private modes may deny storage. */ }
const scoreText = value => String(value).padStart(6, '0');
function sound(type) {
  if (muted) return;
  try {
    audio ??= new (window.AudioContext || window.webkitAudioContext)();
    if (audio.state === 'suspended') audio.resume().catch(() => {});
    const osc = audio.createOscillator(), gain = audio.createGain(), now = audio.currentTime;
    const notes = { fire: [700, 180, .06], hit: [160, 50, .12], damage: [100, 30, .25], power: [400, 950, .2], wave: [250, 700, .25], over: [180, 40, .6] };
    const [from, to, duration] = notes[type] || notes.hit;
    osc.type = type === 'fire' ? 'triangle' : 'sine'; osc.frequency.setValueAtTime(from, now); osc.frequency.exponentialRampToValueAtTime(to, now + duration);
    gain.gain.setValueAtTime(.045, now); gain.gain.exponentialRampToValueAtTime(.001, now + duration);
    osc.connect(gain); gain.connect(audio.destination); osc.start(now); osc.stop(now + duration);
  } catch { /* Audio is optional; gameplay works without Web Audio. */ }
}
function clearInput() { for (const key of Object.keys(input)) { input[key] = false; agentInput[key] = false; wingmanAgent[key] = false; } agentUntil = 0; wingmanUntil = 0; }
function setMode(value) {
  if (!['human', 'ai', 'coop'].includes(value)) throw new TypeError('Mode must be human, ai or coop');
  loop.reset();
  const teamChanged = (mode === 'coop') !== (value === 'coop');
  mode = value; game.coop = value === 'coop'; $('mode').value = value; clearInput();
  if (teamChanged) {
    const wasReady = game.state === 'ready'; game.reset();
    if (wasReady) { game.state = 'ready'; game.events = []; }
    else { $('overlay').hidden = true; }
  }
  if (game.state === 'playing') $('game').focus({ preventScroll: true });
  $('pilot-help').textContent = { human: 'You move. You fire.', ai: 'AI moves, aims and fires. Enjoy the show.', coop: 'Two ships. You fly green. AI flies violet. Shared score.' }[mode];
}
$('mode').addEventListener('change', e => setMode(e.target.value));
function showOverlay(eyebrow, title, description, button) {
  $('overlay').hidden = false; $('eyebrow').textContent = eyebrow; $('title').innerHTML = title;
  $('description').textContent = description; $('play').innerHTML = button + ' <span>↗</span>';
}
function sync() {
  $('score').textContent = scoreText(game.score); $('best').textContent = scoreText(best);
  $('wave').textContent = String(game.wave).padStart(2, '0');
  $('lives').textContent = Array.from({ length: 3 }, (_, i) => i < game.lives ? '◆' : '◇').join(' ');
  $('lives').setAttribute('aria-label', `${game.lives} lives`);
  $('wingman-hud').hidden = !game.wingman;
  $('wingman-lives').textContent = Array.from({ length: 3 }, (_, i) => i < (game.wingman?.lives || 0) ? '◆' : '◇').join(' ');
  $('wingman-lives').setAttribute('aria-label', `${game.wingman?.lives || 0} AI lives`);
  $('weapon').textContent = game.power > 0 ? `TRIPLE LASER · ${Math.ceil(game.power)}s` : 'STANDARD LASER';
  $('pause').disabled = !['playing', 'paused'].includes(game.state);
  $('pause').textContent = game.state === 'paused' ? '▶' : 'Ⅱ';
  $('pause').setAttribute('aria-label', game.state === 'paused' ? 'Resume game' : 'Pause game');
}
function pause() {
  loop.reset(); game.togglePause(); clearInput();
  if (game.state === 'paused') showOverlay('MISSION ON HOLD', 'TAKE A<br>BREATHER<span>.</span>', 'Your sector can wait. Ready when you are.', 'Resume mission');
  else if (game.state === 'playing') { $('overlay').hidden = true; $('game').focus({ preventScroll: true }); }
  sync();
}
$('play').addEventListener('click', () => {
  loop.reset(); clearInput();
  if (game.state === 'paused') game.togglePause(); else game.reset();
  $('overlay').hidden = true; $('game').focus({ preventScroll: true }); sync();
});
$('pause').addEventListener('click', pause);
$('sound').addEventListener('click', () => {
  muted = !muted; $('sound').textContent = muted ? 'Sound off' : 'Sound on'; $('sound').setAttribute('aria-pressed', String(!muted));
  if (!muted) sound('power');
  if (game.state === 'playing') $('game').focus({ preventScroll: true });
});
const keys = { ArrowLeft: 'left', a: 'left', A: 'left', ArrowRight: 'right', d: 'right', D: 'right', ' ': 'fire' };
window.addEventListener('keydown', e => {
  if (keys[e.key] && game.state === 'playing' && e.target.tagName !== 'BUTTON') { e.preventDefault(); input[keys[e.key]] = true; }
  if ((e.key.toLowerCase() === 'p' || e.key === 'Escape') && !e.repeat) pause();
});
window.addEventListener('keyup', e => { if (keys[e.key]) input[keys[e.key]] = false; });
window.addEventListener('blur', () => { clearInput(); if (game.state === 'playing') pause(); });
document.addEventListener('visibilitychange', () => { if (document.hidden && game.state === 'playing') pause(); });
for (const button of document.querySelectorAll('[data-action]')) {
  button.addEventListener('pointerdown', e => {
    e.preventDefault(); button.setPointerCapture(e.pointerId);
    if (game.state === 'playing') input[button.dataset.action] = true;
  });
  for (const event of ['pointerup', 'pointercancel', 'lostpointercapture']) button.addEventListener(event, () => { input[button.dataset.action] = false; });
}
function updateGame(dt) {
  const human = { ...input };
  if (inputTimestamp < agentUntil) for (const key of Object.keys(human)) human[key] ||= agentInput[key];
  const wingmanControls = game.wingman
    ? (inputTimestamp < wingmanUntil ? wingmanAgent : pilotInput(game, game.wingman))
    : undefined;
  const controls = mode === 'ai' ? pilotInput(game) : human;
  game.update(dt, controls, wingmanControls);
}
function frame(timestamp) {
  inputTimestamp = timestamp;
  loop.advance(timestamp, updateGame, game.state === 'playing');
  for (const event of game.events.splice(0)) {
    sound(event.type);
    if (event.type === 'wave' || event.type === 'power') {
      $('notice').textContent = event.type === 'wave' ? (event.wave % 5 === 0 ? 'WARNING / MOTHERSHIP' : `SECTOR ${String(event.wave).padStart(2, '0')} / ENGAGE`) : event.power === 'shield' ? 'HULL REPAIRED + SHIELD' : 'TRIPLE LASER ONLINE';
      noticeUntil = timestamp + 2000;
    }
    if (event.type === 'over') {
      clearInput(); noticeUntil = 0;
      showOverlay('TRANSMISSION LOST', 'GOOD<br>FIGHT<span>.</span>', `Score ${scoreText(game.score)} · Sector ${game.wave}. Earth needs you again.`, 'Fly again');
      $('play').focus({ preventScroll: true });
    }
  }
  if (game.score > best) { best = game.score; bestDirty = true; }
  if (bestDirty && (timestamp >= nextSave || game.state === 'over')) {
    try { localStorage.setItem('space-best', String(best)); } catch { /* Session score remains available. */ }
    bestDirty = false; nextSave = timestamp + 750;
  }
  if (noticeUntil && timestamp > noticeUntil) { $('notice').textContent = ''; noticeUntil = 0; }
  // HUD need only change at 10 Hz; gameplay/rendering stay at display refresh.
  if (timestamp >= nextHud) { sync(); nextHud = timestamp + 100; }
  renderer.recordFrame(timestamp, game.state === 'playing');
  renderer.render(game, timestamp / 1000);
  requestAnimationFrame(frame);
}
sync(); requestAnimationFrame(frame);

/** Browser-agent integration. Snapshots are copies; commands use normal gameplay. */
window.spaceInvaders = Object.freeze({
  version: 1, build: '2.1.0',
  getState: () => structuredClone({ state: game.state, mode, score: game.score, best, lives: game.lives, wave: game.wave, time: game.time, width: 960, height: 680, player: game.player, wingman: game.wingman, enemies: game.enemies, shots: game.shots, drops: game.drops, power: game.power, invincible: game.invincible, performance: renderer.getStats() }),
  start: () => $('play').click(),
  pause: () => { if (game.state === 'playing') pause(); },
  resume: () => { if (game.state === 'paused') pause(); },
  setMode,
  setInput: (action = {}, durationMs = 200, ship = 'player') => {
    if (!['player', 'wingman'].includes(ship)) throw new TypeError('Ship must be player or wingman');
    const target = ship === 'wingman' ? wingmanAgent : agentInput;
    for (const key of Object.keys(target)) target[key] = action[key] === true;
    const until = performance.now() + Math.max(0, Math.min(1000, Number(durationMs) || 0));
    if (ship === 'wingman') wingmanUntil = until; else agentUntil = until;
  },
  release: clearInput,
});
