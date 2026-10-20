# What learns, and what does not

## Ollama: persistent strategy memory

The adapter sends compact structured observations to a real local Ollama `/api/chat` endpoint, requesting a bounded JSON target/fire action. A local controller steers toward the chosen target and optionally dodges incoming fire between model decisions, using the learned pilot's reflex parameters when a learned policy exists (external agents' `targetX` commands steer the same way). There is one action request in flight; timeouts/invalid output use the explicitly labeled fallback pilot. The game loop never waits for model generation.

After each completed or restarted episode involving Ollama, a separate reflection request uses the score, survival time, per-ship reward and recent results to improve a short strategy. The next episode includes that strategy in the prompt. Memory is persisted under `.data/memory/`, keyed by model. Failed reflection preserves the last strategy and records the error. A different model does not overwrite another model's memory.

This is feedback-driven strategy/prompt memory, **not model weight training**. It may improve behavior but improvement is not guaranteed. No private conversation or API credential is sent to Ollama: only game state and previous game strategy/results.

## Local pilot: long-term, resumable parameter learning

The small controller has parameters for target lead, projectile look-ahead, dodge margin, target bias, firing alignment, and how much detour a falling drop is worth: **+** (a life and a shield, worth more when a life is missing) and **ϟ** (8 seconds of triple laser, worth more when none is active). Drops are only chased when the ship can get under them before they land. Training is a (1 + population) evolution strategy using the real game engine in accelerated headless episodes. Each generation plays the current parent and its mutations on **fresh seeds**, so training never reuses the same few games.

A new policy is never accepted on training reward alone. The parent is regularly checked on a fixed benchmark of 48 unseen games played until they are lost (at most 900 seconds), measuring the **level** reached and the game length. Level is continuous: 6.5 means half of sector 7 is cleared. The parent becomes the **champion**, the policy the *Learned pilot* plays, only if it reaches a higher level than the current champion there. A checkpoint from an older benchmark is re-judged automatically. A parent that loses goes back to the champion and continues with a smaller mutation step. A run therefore can never replace a better saved policy with a worse one.

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

`npm run bench:llm -- heuristic learned oracle qwen2.5:0.5b space-pilot` compares controllers on the same 8 seeded games, played until they are lost (at most 600 seconds). It reports level, game length, score and drops collected. The game waits for each model decision (every 0.25 game seconds), so the score measures play, not inference speed. In the live arena the model also has to be fast enough. `oracle` sends the learned pilot's own targets through the model's command path: it is the ceiling a perfect student could reach. Results are appended to `.data/llm/benchmarks.jsonl`.

Stored under `.data/llm/`: `state.json` (run counter, base-model score, champion and its adapter), `history.jsonl` (one line per run), `student-states.jsonl` (the last 20,000 labelled states champions reached) and `runs/NNNN/` (training data, adapter and Modelfile). The fused model and GGUF are deleted after import unless `--keep` is given, because Ollama keeps its own copy.

## Inspectable match records

Each match produces JSONL containing seed, provider changes, actions, events, periodic observations and final results. Tokens are omitted. A summary includes shared game score and separate ship rewards. Records are sampled at 5 Hz for observations; controls are logged on changes and at most four repeats per second. The last 100 completed episodes are retained. A 12 MiB limit/backpressure can omit trace lines; the summary explicitly marks truncation. A restart saves the previous episode.

The arena stops an unattended match at 300 simulation seconds. Model inference can be slow; the adapter reports request latency, model errors, and whether the action currently comes from Ollama, an external agent or local fallback.
