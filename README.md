# SPACE / Invaders Reborn

A complete, playable rebuild of the 2014 AngularDart experiment. One ship, waves of aliens, a mothership every fifth sector. Procedural shaded ships, an orbital planet, a perspective grid, glowing lasers and particle explosions — no external assets or runtime dependencies.

## Play

**Quickest:** download `space-invaders.html` from the PR's `playable/` folder and open the downloaded file in your browser. It is the complete game in a single HTML file, with no server, installation or network needed. To regenerate it, run `npm run build`; the portable output is `dist/space-invaders.html`. After changing source files, copy that output into `playable/space-invaders.html` before committing.


Install Node.js 20 or newer, then run:

```sh
npm start
```

Open **http://localhost:3000** and select **Launch mission**. No `npm install` is needed. Alternatively, serve this folder with `python3 -m http.server 3000`. The development `index.html` uses separate ES modules and requires an HTTP server. The bundled portable `space-invaders.html` also works as a `file://` URL.

| Action | Controls |
| --- | --- |
| Move | A / D or left / right arrows |
| Shoot | Hold Space |
| Pause / resume | P, Escape, or the pause button |
| Touch | Hold the left, right, and FIRE buttons; simultaneous touches supported |
| Audio | Toggle Sound in the header; muted initially |

## Human, AI, or two-ship co-op

Select **Flight control** before launch or during play:

- **Human pilot:** you move and shoot your own ship.
- **AI autopilot:** a local heuristic pilot aims, fires and dodges incoming shots. No model, paid service or API key is involved; it can lose like a human.
- **Co-op · You + AI wingman:** you control the green ship; AI independently controls the violet ship. Each has three lives, its own weapon cooldown, temporary shield and collected powerups. Friendly shots do not hurt either ship. Score and sector progression are shared. If one ship is destroyed, the other continues until it is also lost or the invaders cross the defense line.

Entering or leaving co-op starts a fresh mission so both ships start fairly. Switching human/autopilot on a solo ship preserves the current mission.

Collect **ϟ** for eight seconds of triple laser, or **+** for hull repair and a temporary shield. Clear the formation to advance. Survive enemy fire and stop invaders reaching your defense line. Your best score is stored on the current browser and origin when local storage is available. Switching tabs automatically pauses the mission.

## Build and validate

```sh
npm test
npm run build
node scripts/serve.mjs --dist
```

`dist/` is a self-contained static site; deploy its contents to any static host, including a subdirectory. The game makes no external requests, uses no credentials, and works offline once served locally. The renderer batches sprites through WebGL when hardware acceleration is available, with an automatic Canvas 2D fallback for unsupported or software GPUs. Neither backend requires an external library. Current Chrome, Firefox, Safari and Edge are the intended browsers.

## Structure

- `src/engine.js`: deterministic, frame-rate-independent simulation in a 960 × 680 world; injected random source for tests.
- `src/renderer.js`: automatic renderer selection and performance telemetry.
- `src/webgl-renderer.js`: texture-atlas sprite batching in a single draw call.
- `src/canvas-renderer.js`: procedural assets and Canvas 2D fallback.
- `src/quality.js`: adaptive resolution/effects, separate from simulation rules.
- `src/collision-grid.js`: reused broad-phase bins for laser impacts.
- `src/main.js`: keyboard/pointer input, UI, pause, optional Web Audio and best-score persistence.
- `src/style.css`: responsive shell, HUD and touch controls.
- `test/engine.test.js`: combat, progression, pause, bounds, powerups and restart regression coverage.
- `scripts/`: dependency-free development server and static build.

The original Dart/AngularDart project is preserved under `legacy/angular-dart/` and in Git history at commit `8eb7c69b485ff3abbe8d1b00a8939cebe095fe89`. The runnable browser game uses the modules in `src/`; the legacy archive is not part of its build.

## Browser-agent API (Codex, Playwright, or another agent)

`window.spaceInvaders` is available in both builds. `getState()` returns a structured copy: world dimensions, game state, mode, time, score, player, wingman (or null), enemies, projectiles and drops. Each ship includes position, lives, cooldown, shield timer and weapon timer. Actions use the same simulation as keyboard/touch controls.

```js
spaceInvaders.setMode('human'); // 'human' | 'ai' | 'coop'
spaceInvaders.start();
const observation = spaceInvaders.getState();
spaceInvaders.setInput({ right: true, fire: true }, 200);
spaceInvaders.pause();
spaceInvaders.resume();
spaceInvaders.release();
```

For a human + Codex team, keep the game tab active, select co-op, then let the agent control **only the wingman**:

```js
spaceInvaders.setMode('coop');
spaceInvaders.start();
// Read state and refresh commands in a loop through the browser tool:
spaceInvaders.getState();
spaceInvaders.setInput({ left: true, fire: true }, 250, 'wingman');
```

`setInput(action, durationMs = 200, ship = 'player')` replaces that agent's previous held inputs, expires after at most 1000 ms, and accepts `player` or `wingman`. The wingman follows agent commands while they are fresh and returns to its local AI when they expire. Player commands combine with keyboard inputs in human/co-op modes; solo autopilot controls the primary ship in AI mode. `release()` clears held keyboard and agent inputs. `start()` launches or restarts, and resumes if paused. The API does not expose mutations, invulnerability commands, or score overrides. Losing focus pauses gameplay, including agent gameplay.

Optional real-browser regression: install Python Playwright and Chromium, run `npm run build`, then `python test/browser-smoke.py`. It covers keyboard input, pause, co-op, agent control, audio UI, mobile layout and the portable build. The Python dependency is only for this optional test, not for playing or building.

## Performance and timing (2.1)

The full 36-invader formation now moves at **96 world pixels/second in sector 1**, independent of how many enemies remain. Previously the first sector started at 29 px/s and accelerated toward 92 px/s as enemies died; that made a full invasion feel much slower even at 60 FPS. Sector progression still increases difficulty. Player movement is now 520 px/s, lasers 960 px/s, standard fire interval 150 ms, and transitions between cleared waves 900 ms.

Simulation runs at a fixed 120 Hz. Frames catch up at most 250 ms (30 bounded steps); pause clears time debt. Rendering at 15, 30, 60 and 144 FPS yields identical game state for identical one-second input. Rendering quality never reduces enemy count, combat accuracy, or simulation speed.

Hardware WebGL batches the backdrop, stars, invaders, ships, shots and particles into one atlas/buffer and **one draw call per frame**. Unsupported/failed WebGL and recognized software GPUs use the Canvas fallback. If an unidentified GPU stays slow even at low quality, automatic mode falls back to Canvas. Lower frame rates reduce only canvas resolution, stars and decorative particles; quality recovers gradually. Visual particles have a 1,200-item cap. The HUD runs at 10 Hz, persistence is batched, collision bins avoid scanning every enemy for each laser, and AI steering avoids intermediate arrays.

### Verify a full invasion

```sh
npm test
npm run build
python test/browser-smoke.py
python test/browser-smoke.py --webgl
python test/full-invasion.py . --soak
```

The load test retains all enemies throughout each scene. It reports actual frame cadence and p95 frame intervals for 3 enemies, 36 enemies, and 144 enemies plus 256 shots and 1,000 particles. `--soak` holds the heaviest scene for 30 seconds. It fails if the full invasion renders over 20% slower than the sparse scene. Run `--canvas` to exercise compatibility or `--webgl` to force GPU batching. The browser smoke test exercises both rendering paths and WebGL context restoration. Python Playwright and Chromium are optional development dependencies only.

`spaceInvaders.getState().performance` reports the selected backend, FPS, quality, backing resolution and GPU draw calls. Diagnostic URL options `?renderer=canvas2d` and `?renderer=webgl` override automatic selection. The normal game chooses the backend itself, including when opening the downloaded portable HTML.

A local 1440×1100, device-scale-2 Chromium test measured approximately **60 FPS with 36 enemies**, and **60 FPS with 144 enemies, 256 shots and 1,000 particles** using automatic mode (Canvas selected for the environment's software GPU). These are measurements on this environment, not a hardware-independent guarantee. The prior render-call microbenchmark alone was insufficient to validate whole-frame performance; the full-invasion test replaces it for acceptance.

A web server is supported via `npm start`, but cannot fix local GPU rendering or enemy-speed rules. The portable HTML remains usable without Node, Docker, model credentials or external requests. Docker adds no rendering acceleration and is not required.
