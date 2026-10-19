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

`dist/` is a self-contained static site; deploy its contents to any static host, including a subdirectory. The game makes no external requests, uses no credentials, and works offline once served locally. The renderer uses Canvas 2D with depth effects, rather than a WebGL dependency. Current Chrome, Firefox, Safari and Edge are the intended browsers.

## Structure

- `src/engine.js`: deterministic, frame-rate-independent simulation in a 960 × 680 world; injected random source for tests.
- `src/renderer.js`: procedural Canvas drawing with device-pixel-ratio scaling.
- `src/main.js`: keyboard/pointer input, UI, pause, optional Web Audio and best-score persistence.
- `src/style.css`: responsive shell, HUD and touch controls.
- `test/engine.test.js`: combat, progression, pause, bounds, powerups and restart regression coverage.
- `scripts/`: dependency-free development server and static build.

The former Dart/AngularDart sources, Bootstrap bundle, IDE settings and obsolete dependency manifests were removed from the active tree. They remain available in Git history at commit `8eb7c69b485ff3abbe8d1b00a8939cebe095fe89`. This intentionally replaces the old application rather than attempting to run its discontinued toolchain.

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

## Performance and timing

The simulation advances at a fixed 120 Hz, independently of display refresh. A frame can catch up at most 250 ms (30 bounded steps); pausing clears time debt. At 15, 30, 60 and 144 rendering FPS, the same one-second input sequence produces identical simulation state. This fixes slow motion caused by discarding time from frames longer than 50 ms.

Glow-heavy alien, mothership and laser sprites, plus the static planet/background, are baked into offscreen canvases once. The visible canvas has a 1.5-million-pixel budget and a DPR cap of 1.5. ResizeObserver updates its dimensions outside the render loop. The HUD updates at 10 Hz, high-score writes are batched, and human mode does not calculate unused AI steering.

An initial 4.5-second headless Chromium comparison at a 1440×1100 viewport and device scale 2 measured a render-call median of 1.6 ms before and 0.3 ms after, and p95 of 2.3 ms before and 0.8 ms after. These are local measurements, not a guarantee for other hardware. The browser smoke test also passes after these changes. Reproduce a sample with `python test/performance.py .`; run the command again with the path to another checkout to compare revisions under the same browser conditions.
