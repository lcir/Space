# What learns, and what does not

## Ollama: persistent strategy memory

The adapter sends compact structured observations to a real local Ollama `/api/chat` endpoint, requesting a bounded JSON target/fire action. A local controller steers toward the chosen target and optionally dodges incoming fire between model decisions. There is one action request in flight; timeouts/invalid output use the explicitly labeled fallback pilot. The game loop never waits for model generation.

After each completed or restarted episode involving Ollama, a separate reflection request uses the score, survival time, per-ship reward and recent results to improve a short strategy. The next episode includes that strategy in the prompt. Memory is persisted under `.data/memory/`, keyed by model. Failed reflection preserves the last strategy and records the error. A different model does not overwrite another model's memory.

This is feedback-driven strategy/prompt memory, **not model weight training**. It may improve behavior but improvement is not guaranteed. No private conversation or API credential is sent to Ollama: only game state and previous game strategy/results.

## Local pilot: long-term, resumable parameter learning

The small controller has parameters for target lead, projectile look-ahead, dodge margin, target bias and firing alignment. Training is a (1 + population) evolution strategy using the real game engine in accelerated headless episodes. Each generation plays the current parent and its mutations on **fresh seeds**, so training never reuses the same few games.

A new policy is never accepted on training reward alone. The parent is regularly checked on a fixed benchmark of 48 unseen 300-second games. It becomes the **champion**, the policy the *Learned pilot* plays, only if it beats the current champion there. A parent that loses goes back to the champion and continues with a smaller mutation step. A run therefore can never replace a better saved policy with a worse one.

Reward is kill points / 25, -10 for damage, -0.01 per shot, +0.03 per survival second, and a training-only +10 for clearing a sector. Live score remains ordinary game score.

### Running it

```sh
npm run train                          # 20 more generations
npm run train -- --minutes 60          # train for an hour
npm run train -- --forever             # until Ctrl+C (finishes the current generation and benchmarks the parent)
npm run train -- --generations 500 --population 12 --seeds 6 --seconds 180 --benchmark-every 10
```

Every run continues from the saved checkpoint. **Learning and recordings → Train local pilot** in the arena runs 10 more generations of the same training in a worker without blocking the game. Do not run two trainings on the same data directory at once: the second one to save stops with an error instead of overwriting the other one's progress.

### Stored data

Everything lives in `DATA_DIR` (default `.data/`, the `arena-data` volume in Docker):

| File | Content |
| --- | --- |
| `policy.json` | Current champion: parameters, benchmark reward, default-policy baseline, generation and episode count. Written only on promotion. |
| `training/state.json` | Resumable checkpoint: generation, mutation step, parent, champion, benchmark definition and baseline. Written atomically after every generation. |
| `training/history.jsonl` | One line per generation: training and benchmark rewards, promotion and parameters. Any former champion can be restored from it. Rotated to `history.1.jsonl` at 8 MiB. |

To start training from scratch, delete `training/` (and `policy.json` to forget the champion). A `policy.json` without a checkpoint is used as the starting point.

This is a small optimized control policy, not PPO, a neural network, or a fine-tuned language model. Its five parameters plateau quickly, so further gains need a richer controller rather than more generations.

## Inspectable match records

Each match produces JSONL containing seed, provider changes, actions, events, periodic observations and final results. Tokens are omitted. A summary includes shared game score and separate ship rewards. Records are sampled at 5 Hz for observations; controls are logged on changes and at most four repeats per second. The last 100 completed episodes are retained. A 12 MiB limit/backpressure can omit trace lines; the summary explicitly marks truncation. A restart saves the previous episode.

The arena stops an unattended match at 300 simulation seconds. Model inference can be slow; the adapter reports request latency, model errors, and whether the action currently comes from Ollama, an external agent or local fallback.
