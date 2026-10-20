# Connect Codex or another agent

Start the arena with `npm ci && npm start`. The API is local at `http://127.0.0.1:3000`; a human opens `/arena`. For two-ship play the human owns `player`, while the agent claims `wingman`. The server runs physics and rendering remains in the browser. Do not call an LLM on every simulation tick.

## Real-time co-op

Using the included CLI from the repository root:

```sh
npm run agent -- start --mode coop
npm run agent -- claim --role wingman --name Codex
npm run agent -- observe
npm run agent -- act --action '{"targetX":650,"fire":true,"dodge":true}' --duration 1500
npm run agent -- release
```

The CLI stores its opaque controller lease in ignored `.data/agent-lease.json` (mode 0600), never prints it, and can renew its own claim. A second agent cannot claim an occupied ship. A browser cannot send input for the wingman through its human socket.

Read observations and refresh actions in a loop. `targetX` is a desired world X coordinate in 32..928. `dodge:true` enables a local low-latency reflex layer while the agent selects targets. The reflexes dodge incoming shots and collect falling drops by the learned pilot's rules: a + whenever it is safe, a ϟ when at most 5 seconds of triple laser are left, each at the last moment. A target aimed at a drop the rules do not want is replaced by the rules' enemy target. Set `dodge:false` for unassisted steering exactly to `targetX`. Alternatively send booleans `left`, `right`, and `fire` for direct control. Commands replace previous controls, not accumulate. Direct controls expire within 500 ms; target commands within 2000 ms. Claims expire after 10 seconds without valid commands/renewal. Stale external commands are visibly replaced by the local pilot, rather than pretending the remote model is still controlling the ship.

For an agent whose tool calls take several seconds, use paused solo stepping while developing its strategy. This avoids judging tool latency as playing skill.

## Paused solo training / Codex stepping

```sh
npm run agent -- start --mode ai
npm run agent -- pause
npm run agent -- claim --role player --name Codex
npm run agent -- observe
npm run agent -- step --frames 120 --action '{"targetX":700,"fire":true,"dodge":true}'
# Observe the resulting state, choose the next action, renew claim if needed, repeat.
```

Each `step` advances exactly 1..240 fixed 1/120-second frames and pauses again. The model can take as long as needed between decisions; re-claim after expiry. Stepping is rejected during real-time play and during two-ship co-op. Browsers automatically become spectators in solo AI mode, so a human can watch without occupying the agent’s ship. Rewards, hits and recordings use the same game rules. No action can alter score, health, difficulty or positions directly.

## JavaScript client

```js
import { ArenaClient } from './agents/control.mjs';
const arena = new ArenaClient('http://127.0.0.1:3000');
await arena.claim('wingman', 'Codex');
const state = await arena.observe();
await arena.act({ targetX: 600, fire: true, dodge: true }, 1000);
await arena.release();
```

The current interactive Codex session can use this client or the CLI through terminal tools; there is no extra OpenAI API integration or key requirement. An unattended Codex installation can use the same protocol in its own local workspace. This chat session does not keep running after the turn ends.

## HTTP protocol

| Method / path | Purpose |
| --- | --- |
| `GET /api/state` | Authoritative full snapshot; controllers' tokens are omitted |
| `POST /api/start` | `{mode:"human"\|"ai"\|"coop"}`; save previous match, start a new one |
| `POST /api/control` | `{command:"pause"\|"resume"}` |
| `POST /api/claim` | `{role,name,token?}` → opaque `{token,role,expiresInMs}` |
| `POST /api/action` | `{token,role,action,durationMs}` |
| `POST /api/step` | `{token,role:"player",action,frames}`; paused solo only |
| `POST /api/release` | `{token}` |
| `POST /api/config` | `{provider:"heuristic"\|"ollama"\|"learned"\|"external"\|"none",model?}` |
| `GET /api/models` | Installed Ollama models and reachability |
| `GET /api/agent` | Provider, fallback, strategy memory and training status |
| `POST /api/train` | `{generations?,population?,seconds?}` (defaults 10/8/120); continues the saved training in a background worker |
| `GET /api/matches` | Last 100 completed match summaries |
| `GET /api/matches/:id/download` | JSONL recording |

Mutations require `Content-Type: application/json`, and the server rejects foreign browser origins. Bind is 127.0.0.1 by default; this is a local arena, not a hosted multiplayer identity service.

## WebSocket

Connect to `/ws` on the same origin. Send `{type:"join"}` to claim the human `player`; the reply includes the token. Send `{type:"input",token,action:{left,right,fire},durationMs:250}` at up to 30 Hz. Receive `{type:"state",observation,events}` at 20 Hz; interpolate display positions between snapshots. Excessively backed-up sockets skip snapshots, not simulation. Closing a socket releases its human ship. A page losing focus sends neutral input; it does not pause a remote agent's mission.
