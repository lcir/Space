# What learns, and what does not

## Ollama: persistent strategy memory

The adapter sends compact structured observations to a real local Ollama `/api/chat` endpoint, requesting a bounded JSON target/fire action. A local controller steers toward the chosen target and optionally dodges incoming fire between model decisions, using the learned pilot's reflex parameters when a learned policy exists (external agents' `targetX` commands steer the same way). There is one action request in flight; timeouts/invalid output use the explicitly labeled fallback pilot. The game loop never waits for model generation.

After each completed or restarted episode involving Ollama, a separate reflection request uses the score, survival time, per-ship reward and recent results to improve a short strategy. The next episode includes that strategy in the prompt. Memory is persisted under `.data/memory/`, keyed by model. Failed reflection preserves the last strategy and records the error. A different model does not overwrite another model's memory.

This is feedback-driven strategy/prompt memory, **not model weight training**. It may improve behavior but improvement is not guaranteed. No private conversation or API credential is sent to Ollama: only game state and previous game strategy/results.

## Local pilot: long-term, resumable parameter learning

The small controller has parameters for target lead, target bias, how strongly it sticks to its current target, firing alignment, its dodge safety margin and look-ahead, and how much detour a falling drop is worth: **+** (a life and a shield, worth more when a life is missing) and **ϟ** (8 seconds of triple laser, worth more when none is active). Drops are only chased when the ship can get under them before they land. Dodging considers every incoming shot, including the boss's spread. The pilot keeps its target unless that position or the path to it would be hit within the look-ahead. Otherwise it moves to the nearest safe position, or, if none is safe, to the one hit latest. Model and agent targets use the same dodging. Training is a (1 + population) evolution strategy using the real game engine in accelerated headless episodes. Each generation plays the current parent and its mutations on **fresh seeds**, so training never reuses the same few games.

A new policy is never accepted on training reward alone. The parent is regularly checked on a fixed benchmark of 48 unseen games played until they are lost (at most 600 seconds; difficulty stops rising after sector 15, so a strong policy can survive indefinitely), measuring the **level** reached and the game length. Level is continuous: 6.5 means half of sector 7 is cleared. The parent becomes the **champion**, the policy the *Learned pilot* plays, only if it reaches a higher level than the current champion there. A checkpoint from an older benchmark is re-judged automatically. A parent that loses goes back to the champion and continues with a smaller mutation step. A run therefore can never replace a better saved policy with a worse one.

Training fitness is the mean level reached on the generation's games (300 seconds each by default), the same measure the benchmark uses. The per-ship reward shown in the arena (kill points / 25, -10 for damage, -0.01 per shot, +0.03 per survival second) is only reported, not optimized. Live score remains ordinary game score.

### Drop priority rules (experiment)

`{...params, rules: true}` replaces the drop values with fixed priorities. Dodging stays first. A **+** is taken whenever it is safe, even with full lives, because it always gives 3 seconds of invulnerability. A **ϟ** is taken only when no triple laser is active and collecting it is safe. Otherwise the pilot shoots enemies. A drop is safe when flying under it and waiting until it is caught is hit by no shot already in the air. Hits that would land while the ship is invulnerable do not count. `npm run sim:rules` plays the saved champion with and without the rules on the same 200 unseen games (seeds 950001+):

| Cap | Pilot | Level | Game length | + / ϟ per game | Hits per minute |
| --- | --- | --- | --- | --- | --- |
| 600 s | champion (drop values) | 64.86 | 478 s | 38.6 / 96.1 | 1.53 |
| 600 s | champion + rules | **72.20** | 578 s | 63.4 / 71.8 | **0.76** |
| 1800 s | champion (drop values) | 97.26 | 932 s | 58.3 / 145.4 | 1.25 |
| 1800 s | champion + rules | **136.19** | 1532 s | 118.6 / 137.8 | **0.58** |

With drop values, 86% of hits happen while the pilot is flying to a drop. The script also reports 0% for the rules, but that number is partly true by construction: the rules drop a target as soon as it becomes unsafe, so on the tick before a hit they are no longer aiming at a drop. The meaningful evidence is the halved hit rate and the longer games. The rules are not yet trained or used by the arena. Training strips the flag (`sanitizePolicy`), but the arena, distillation and `bench:llm` would use a `rules` key written into `policy.json`.

The simulation also records what was going on at the last tick when some position was still safe, because just before a hit none is (200 games, 600 s cap):

| Pilot | Flying to a drop (share of time) | Hits while aiming at a drop | ≥2 shots | Boss | ≤1 s after a pickup | Trapped <0.1 s before the hit |
| --- | --- | --- | --- | --- | --- | --- |
| champion (drop values) | 52% | 86% | 81% | 5% | 12% | 100% |
| champion + rules | 37% | 28% | 82% | 5% | 11% | 100% |

With drop values, chasing drops is strongly over-represented among hits. With the rules, it is not. Every hit comes less than 0.1 s after a safe position still existed. The cause is the collision prediction: it checks a shot only when it enters, crosses the middle of and leaves the ship's row. A ship crossing a shot's column can pass between those samples, so the prediction calls a path safe that runs through the shot.

### Experiment log

Each change is measured alone against the previous accepted state, on the same 200 games (seeds 950001+).

| # | Change | Pilot | Level (600 s cap) | Hits per minute | Level (1800 s cap) | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| 0 | baseline | drop values | 64.86 | 1.53 | 97.26 | — |
| 0 | baseline | rules | 72.20 | 0.76 | 136.19 | — |
| 2a | exact (continuous) collision prediction instead of 3 samples | drop values / rules | 64.22 / 72.43 | 1.57 / 0.75 | — | not adopted then: no measurable effect (adopted later, see 8) |
| 2b | steering deadband 10 px → half a 120 Hz step (2.2 px) | drop values | **76.04** | **0.35** | — | **adopted** |
| 2b | | rules | 68.73 | **0.20** | 132.75 | |

The sample-gap explanation above turned out to be wrong (2a). Tracing individual hits showed the real cause: the nearest safe position was 6–8 px away, inside the 10 px deadband of `policyInput`, so the ship never moved there. With 2b almost every game lasts until the cap (596 s of 600, 1784 s of 1800 with the rules), so level now mostly measures how fast sectors are cleared, not survival. The rules are still the safer pilot (0.20 vs 0.35 hits per minute), but they clear sectors more slowly. They collect fewer ϟ (67 vs 112 per game), because a ϟ is only taken when none is active, and they spend detours on + drops at full lives.

| # | Change (rules pilot only) | Level (600 s cap) | Hits per minute | Fresh seeds 960001+ | Decision |
| --- | --- | --- | --- | --- | --- |
| 3 | take ϟ when at most `tripleRefresh` seconds are left: 0 / 1 / 2 / 3 / 4 / **5** / 6 / 8 (always) | 68.73 / 69.77 / 70.54 / 71.78 / 73.08 / **73.47** / 73.23 / 69.88 | 0.20–0.25 | 0 → 68.64, 4 → 72.89, **5 → 73.95** (drop values: 75.86) | **adopted: 5 s** |

Always taking a ϟ (8) collects twice as many but loses levels to the detours. The accepted rule set is `RULES` in `agents/policy.mjs`; `npm run sim:rules` plays it as `rules`.

| # | Change (rules pilot, with 3) | Level 600 s / fresh seeds | Hits per minute | Level 1800 s (game length) | + per game | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| 4 | + also at full lives (the user's rule) | 73.47 / 73.95 | 0.22 / 0.23 | 140.08 (1800 s) | 64 | current default |
| 4 | `shieldAtFull: 0`: + only when a life is missing | **80.14 / 80.44** | 0.32 / 0.34 | **146.37** (1787 s) | 20 | open: faster, but takes more hits |
| 4 | `shieldAtFull: 60 / 120 / 200`: + at full lives only within that many pixels | 75.07 / 74.63 / 74.48 | 0.22–0.24 | — | 54 / 59 / 63 | not adopted |

Skipping + at full lives gains about 6.5 levels in 600 s. A short detour limit recovers little of that, so the cost is not the distance flown but the time spent waiting under a falling drop (up to about 2.5 s) instead of aiming at enemies. It costs about 45% more hits, and over 1800 s some games are lost. It still beats the drop-values pilot on both measures (75.86 levels, 0.34 hits per minute on the fresh seeds).

| # | Change (rules pilot, with 3, + at full lives) | Level 600 s / fresh seeds | Hits per minute | Level 1800 s (game length) | + / ϟ per game | Decision |
| --- | --- | --- | --- | --- | --- | --- |
| 5 | just-in-time pickup: keep shooting until flying under the drop leaves `pickupSlack` seconds; .6 / .3 / .1 / .05 / **0** | 78.44 / 81.20 / 82.99 / 83.25 / **83.79**; fresh seeds: .1 → 82.71, **0 → 83.33** | 0.30–0.32 | .1 → 149.80 (1796 s) | 71 / 106 | **adopted: 0** |

Collecting at the last moment keeps the user's rule (a + whenever it is safe) and is faster than skipping + at full lives (4). It takes more hits than waiting under the drop (0.31 vs 0.22 per minute): the waiting position has been checked for the whole fall, while the position under an enemy has not.

| # | Change (on top of 5) | Level 600 s / fresh seeds | Hits per minute | Decision |
| --- | --- | --- | --- | --- |
| 5 | accepted state | 83.79 / 83.33 | 0.31 / 0.31 | — |
| 6 | `escapeCheck: 1`: after catching a ϟ, some position must still be safe from the known shots (a + gives 3 s of invulnerability anyway) | 84.14 / 83.24 | 0.30 / 0.30 | not adopted: no measurable effect |
| 7 | `columnLimit: 1 / 2 / 3`: skip a drop with that many enemies above it (each enemy fires equally often) | 80.42 / 80.53 / 81.10 | 0.27–0.29 | not adopted: fewer levels for slightly fewer hits |
| 8 | exact collision prediction (2a again) | **83.97 / 83.83** | **0.18 / 0.17** | **adopted** |

With the deadband fixed and drops collected at the last moment, the exact prediction now matters: the ship crosses shot columns much more often. At 1800 s the accepted rules reach level 150.69 in 1796 s with 0.11 hits per minute (baseline: 136.19 in 1532 s, 0.58 hits per minute).

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

## Ollama: training the model's weights by distillation

`npm run distill` teaches a small language model to aim like the learned pilot. It really changes model weights, which strategy memory does not. Every run:

1. Plays the learned pilot headless and records examples: the **exact prompt** the arena sends the model, and the target the pilot would choose in that state. About 30% of the examples are states that earlier champions reached in their own benchmark games, labelled by the pilot. These teach the model to recover from its own mistakes.
2. Fine-tunes LoRA weights for `Qwen/Qwen2.5-0.5B-Instruct` with MLX. It continues from the current champion's adapter.
3. Fuses the adapter and exports an F16 GGUF with `agents/export_gguf.py`, then imports it into Ollama as `space-pilot:candidate`. Ollama cannot run imported Qwen2 safetensors, so the exporter copies metadata and tokenizer from the local `qwen2.5:0.5b` GGUF and replaces only the weights. It checks every tensor against that reference.
4. Benchmarks the candidate. It becomes `space-pilot:latest` (and `space-pilot:run-N`) only if it reaches a higher level than the current champion, or than the base model on the first run. A new benchmark or prompt version re-measures the base model and the champion and discards recorded states that used the old prompt.

The model sees falling drops and its remaining triple-laser time, so it also learns which drops to chase. Select **Ollama** in the arena with model `space-pilot` to fly the champion.

```sh
uv venv .venv && uv pip install --python .venv/bin/python mlx-lm gguf   # once; Apple Silicon only, ~370 MB
ollama pull qwen2.5:0.5b                                                # reference model, 398 MB
npm run train -- --minutes 2                                            # the teacher; needs .data/policy.json
npm run distill                                                         # one run (~15 min, mostly the two benchmarks)
npm run distill -- --runs 5 --samples 8000 --iters 800 --games 8
```

The first run downloads the base weights (~1 GB) into the Hugging Face cache. `MLX_PYTHON`, `OLLAMA_BIN` and `OLLAMA_BASE_URL` override the tool locations. Ollama must run on the same machine, because the exporter reads its local GGUF file.

`npm run bench:llm -- heuristic learned oracle qwen2.5:0.5b space-pilot` compares controllers on the same 8 seeded games, played until they are lost (at most 300 seconds). It reports level, game length, score and drops collected. The game waits for each model decision (every 0.25 game seconds), so the score measures play, not inference speed. In the live arena the model also has to be fast enough. `oracle` sends the learned pilot's own targets through the model's command path: it is the ceiling a perfect student could reach. Results are appended to `.data/llm/benchmarks.jsonl`.

Stored under `.data/llm/`: `state.json` (run counter, base-model score, champion and its adapter), `history.jsonl` (one line per run), `student-states.jsonl` (the last 20,000 labelled states champions reached) and `runs/NNNN/` (training data, adapter and Modelfile). The fused model and GGUF are deleted after import unless `--keep` is given, because Ollama keeps its own copy.

## Inspectable match records

Each match produces JSONL containing seed, provider changes, actions, events, periodic observations and final results. Tokens are omitted. A summary includes shared game score and separate ship rewards. Records are sampled at 5 Hz for observations; controls are logged on changes and at most four repeats per second. The last 100 completed episodes are retained. A 12 MiB limit/backpressure can omit trace lines; the summary explicitly marks truncation. A restart saves the previous episode.

The arena stops an unattended match at 300 simulation seconds. Model inference can be slow; the adapter reports request latency, model errors, and whether the action currently comes from Ollama, an external agent or local fallback.
