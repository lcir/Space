# SPACE / Invaders Reborn — Agent Arena 3.0

Play alone, fly alongside an AI wingman, connect Codex, or let a local Ollama model choose your ship's targets. The fast 2.1 gameplay is retained; this iteration adds a server-authoritative arena, recordings and learning.

## Quick start

You need **Node 20+**. Ollama is optional.

```sh
npm ci          # installs the only dependency, ws
npm start       # serves http://localhost:3000
```

Open **http://localhost:3000/arena**. You fly the green ship with **A/D or arrows** and hold **Space** to fire. The wingman, flown by the provider you choose, is the violet ship, with its own lives, weapons and shields. Both share the score. Touch controls are available on phones.

In the **wingman panel**, pick a provider, click **Apply**, then **Launch mission**:

| Provider | Behavior |
| --- | --- |
| Local pilot | Built-in reactive rules; no model |
| Ollama | A local language model chooses which enemy to shoot every 0.25 s; the reflexes dodge, follow that enemy and collect drops |
| Learned pilot | The trained controller with the drop rules (see *Learning*); no model, the strongest pilot |
| External Codex / agent | An agent connects through the local HTTP protocol |
| No autopilot | Wingman stays idle |

Pause affects the shared mission. Leaving or unfocusing the page releases/neutralizes human input; agents can continue playing without an open browser. There is one shared arena per server instance. A second browser can watch but cannot steal an occupied human ship.

### Fly with the trained Ollama model

[**penous/space-pilot**](https://huggingface.co/penous/space-pilot) is `Qwen2.5-0.5B-Instruct` distilled from the learned pilot (Apache-2.0, 1 GB F16 GGUF). With [Ollama](https://ollama.com) installed and running:

```sh
ollama pull hf.co/penous/space-pilot
OLLAMA_MODEL=hf.co/penous/space-pilot npm start
```

Open http://localhost:3000/arena, select **Ollama** (the model field is prefilled from `OLLAMA_MODEL`), click **Apply** and **Launch mission**. On the LLM benchmark it reaches level 54.2; the base `qwen2.5:0.5b` reaches 9.2. The model only chooses targets, so it plays well only inside this game with its reflexes.

- **Faster decisions:** start Ollama with `OLLAMA_NUM_PARALLEL=4`. On macOS, run `launchctl setenv OLLAMA_NUM_PARALLEL 4` and restart the Ollama app; this lasts until reboot. It halves the time per decision in the benchmark.
- **Reflex parameters:** the reflexes and the Learned pilot use the trained parameters from `.data/policy.json`, which is not in the repository. A fresh clone uses the default parameters, which play about 10% worse in the benchmarks (oracle 49.1 instead of 53.3). `npm run train -- --minutes 60` trains them; every later run continues from the checkpoint.
- **Other models:** `ollama pull qwen2.5:0.5b` (or any installed model), then type its name in the model field and Apply. General models are not trained for this game and play much worse.

The server uses `http://127.0.0.1:11434` by default. Override `OLLAMA_BASE_URL` and `OLLAMA_MODEL` through the environment if needed. First model load can be slower than later decisions. `OLLAMA_TIMEOUT_MS` sets the decision timeout (default 12000 ms). Errors, timeouts and the local fallback are shown explicitly; inference never blocks game ticks.

### Docker: game + Ollama

```sh
docker compose up --build -d
docker compose exec -e OLLAMA_HOST=http://127.0.0.1:11434 ollama ollama pull qwen2.5:0.5b
```

Open **http://localhost:3000/arena** and select Ollama. The default Compose setup runs CPU Ollama; it does not assume a GPU driver. Model files and arena data use named volumes and survive container restarts. `OLLAMA_MODEL` chooses a different installed model; `PORT` changes the published local port. Stop with `docker compose down` (without `-v` to keep learning/model data). Game image runs as a non-root user and includes a health check. Model downloads can be several hundred MB or more, depending on the selected model.

## Connect Codex

```sh
npm run agent -- start --mode coop
npm run agent -- claim --role wingman --name Codex
npm run agent -- observe
npm run agent -- act --action '{"targetX":650,"fire":true,"dodge":true}' --duration 1500
```

An agent reads the observation, chooses another action, and repeats. The lease keeps it separate from the human ship. The current interactive Codex can use the CLI/JavaScript client directly through its tools; no OpenAI API key is required. An unattended agent must run separately; this chat does not continue in the background after a turn ends.

For slower, thoughtful Codex decisions, there is **paused solo stepping**: observe, choose an action, advance a fixed number of game frames, observe again. It cannot be used to pause/advance a human co-op session. See [the complete agent protocol](docs/AGENT_PROTOCOL.md) for CLI, HTTP and WebSocket examples.

## Learning and recordings

Open **Learning and recordings → Train local pilot**, wait for the reported champion level, then select **Learned pilot** and Apply. For long-term training, run `npm run train -- --minutes 60` (or `--forever`) from a terminal. Every run continues from the saved checkpoint.

There are three separate learning mechanisms:

- **Ollama strategy memory:** after a match, reflection updates a short persisted strategy used in future prompts. This does not change the language model's weights.
- **Ollama distillation:** `npm run distill` fine-tunes `qwen2.5:0.5b` (MLX, Apple Silicon) to choose enemies like the learned pilot; the current champion is published as [penous/space-pilot](https://huggingface.co/penous/space-pilot). It imports the result as `space-pilot` only if it reaches a higher level than the previous champion on a seeded LLM benchmark (`npm run bench:llm`).
- **Local policy optimization:** accelerated game episodes on fresh seeds optimize the controller's parameters (aim lead, dodge margin and look-ahead, target bias, firing) for the level reached. Drops follow fixed rules: a + whenever it is safe, a ϟ when at most 5 s of triple laser are left, each collected at the last moment. A new policy replaces the saved champion only by beating it on a fixed benchmark of unseen games. Training is checkpointed in `.data/training/` and runs in a worker while the live arena continues.

Completed/restarted matches produce per-ship rewards, a summary and a downloadable JSONL trace of actions, game events and observations. Data is in ignored `.data/` (or the Docker volume). The last 100 completed matches are retained; large recordings mark omitted trace lines. Read [learning details and reward definitions](docs/LEARNING.md).

## Offline game remains available

Download [`playable/space-invaders.html`](playable/space-invaders.html) and open the downloaded file directly. This includes the local human/AI/co-op game without a server, network or install. Network agents, Ollama, training and persistent match recordings require the arena server. Opening the unbundled development `index.html` requires HTTP.

```sh
npm run build
npm run static
```

The static build is in `dist/`; the portable output is `dist/space-invaders.html`. Copy that output into `playable/space-invaders.html` before committing a new portable edition.

## Validate

```sh
npm test
npm run test:server
npm run build
```

Optional Python Playwright/Chromium browser checks:

```sh
python test/browser-smoke.py
python test/browser-smoke.py --webgl
# With npm start running:
python test/browser-arena.py
```

`test/server.test.mjs` exercises real HTTP and WebSocket connections, ship ownership/lease expiry, recordings, paused stepping, provider timeout behavior, learning persistence, and worker responsiveness. Its Ollama protocol tests use a deterministic local test server; they do not claim to train a language model. Live Ollama and Docker validation results are described in the PR.

`python test/full-invasion.py . --soak` retains a full invasion and a 144-enemy/256-shot/1,000-particle render stress scene. Physics remains fixed at 120 Hz; GPU batching, software-GPU fallback, adaptive visual quality and collision bins retain the prior performance work. Sector-1 enemy speed stays 96 world px/s regardless of survivor count.

## Architecture

```mermaid
flowchart LR
  Browser[Human browser + interpolated renderer] <-->|WebSocket input / snapshots| Room[Node authoritative game room]
  Codex[Codex / external agent] <-->|HTTP observations + leased actions| Room
  Room <-->|Async JSON target decisions| Ollama[Local Ollama]
  Room --> Records[JSONL matches + strategy memory]
  Trainer[Background policy-training worker] --> Policy[Persisted controller parameters]
  Policy --> Room
```

- `src/engine.js`: shared deterministic simulation; `loop.js`, `collision-grid.js`, `pilot.js` retain the game core.
- `src/renderer.js`, `webgl-renderer.js`, `canvas-renderer.js`, `quality.js`: GPU/Canvas rendering and adaptive effects.
- `src/online.js`: network transport and display interpolation; offline play stays local.
- `server/`: HTTP/WebSocket arena, controller leases, Ollama adapter, recordings and training worker.
- `agents/`: external control client/CLI, parameterized policy and reward-driven trainer.
- `legacy/angular-dart/`: original 2014 Dart project, preserved intact.

The server is designed for a local machine: it binds 127.0.0.1, validates browser origin/host, keeps tokens out of snapshots/records and serves only public game files. Docker publishes only on local loopback. Changing `BIND_HOST`/`ARENA_HOST` is an explicit deployment configuration; this iteration does not add Internet accounts or hosted multiplayer authentication.
