# What learns, and what does not

## Ollama: persistent strategy memory

The adapter sends compact structured observations to a real local Ollama `/api/chat` endpoint, requesting a bounded JSON target/fire action. A local controller steers toward the chosen target and optionally dodges incoming fire between model decisions. There is one action request in flight; timeouts/invalid output use the explicitly labeled fallback pilot. The game loop never waits for model generation.

After each completed or restarted episode involving Ollama, a separate reflection request uses the score, survival time, per-ship reward and recent results to improve a short strategy. The next episode includes that strategy in the prompt. Memory is persisted under `.data/memory/`, keyed by model. Failed reflection preserves the last strategy and records the error. A different model does not overwrite another model's memory.

This is feedback-driven strategy/prompt memory, **not model weight training**. It may improve behavior but improvement is not guaranteed. No private conversation or API credential is sent to Ollama: only game state and previous game strategy/results.

## Local pilot: actual reward-driven parameter learning

The small controller has parameters for target lead, projectile look-ahead, dodge margin, target bias and firing alignment. A seeded elitist evolutionary optimizer samples mutations, plays accelerated headless episodes using the real game engine, and retains the highest-reward policy. It evaluates separate held-out seeds and reports both baselines and final rewards. Training in a worker does not block the server's game ticks.

Reward is kill points / 25, -10 for damage, -0.01 per shot, +0.03 per survival second, and a training-only +10 for clearing a sector. The small sector bonus is not included in the displayed live per-ship reward. Live score remains ordinary game score. More training does not guarantee a stronger held-out policy; inspect validation reward instead of assuming success from the training reward alone.

Click **Learning and recordings → Train local pilot**, then select **Learned pilot** and Apply. Or run `npm run train` and Apply again / start a new mission to reload `.data/policy.json`. Default training is 129 episodes (including validation), with 30-second episodes in the UI and 45-second episodes from the CLI. The UI limits training sizes; the worker is stopped on server shutdown.

This is a small optimized control policy, not PPO, a neural network, or fine-tuned Codex. Its weights/parameters really change based on game reward, and the resulting file can be reused in future matches.

## Inspectable match records

Each match produces JSONL containing seed, provider changes, actions, events, periodic observations and final results. Tokens are omitted. A summary includes shared game score and separate ship rewards. Records are sampled at 5 Hz for observations; controls are logged on changes and at most four repeats per second. The last 100 completed episodes are retained. A 12 MiB limit/backpressure can omit trace lines; the summary explicitly marks truncation. A restart saves the previous episode.

The arena stops an unattended match at 300 simulation seconds. Model inference can be slow; the adapter reports request latency, model errors, and whether the action currently comes from Ollama, an external agent or local fallback.
