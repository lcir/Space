# Drop Priority Rules Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Give the learned pilot an explicit, ordered strategy for falling drops (dodge → missing life → triple laser → enemies, each only when it does not risk a hit), and measure it against the current value-based drop chasing.

**Architecture:** The rules are a target selector in `agents/policy.mjs`, switched on by `params.rules === true`. They reuse the shot-collision prediction that `safeX` already uses, which is extracted into two small functions so both share one definition of "this position gets hit". Dodging (`safeX`) stays the last layer of `policyInput`, so it still overrides every target. A simulation script compares both pilots on the same unseen games.

**Tech Stack:** Node ≥ 20 ES modules, `node:test`, the deterministic `Game` engine from `src/engine.js`. No dependencies.

**Spec:** The user's rules in this conversation, restated in the next section.

## Rules (spec)

1. **Dodge shots.** Always first. Nothing below may put the ship where a known enemy shot hits it.
2. **Collect a + (life)** whenever it is safe: getting under the drop and waiting there until it is caught is not hit by any known shot sooner than that. This applies with full lives too, because a + always gives 3 seconds of invulnerability (and a life when one is missing).
3. **Collect a ϟ (triple laser)** only when **both** hold: the ship has no triple laser active (`power <= 0`), and collecting it is safe in the same sense as rule 2.
4. **Destroy enemies**, again only where that is safe. This is the existing aim plus `safeX`.

A lower rule applies only when no higher rule has a candidate. A + that is unsafe or out of reach falls through to ϟ (this ordering was confirmed by the user: + is taken whenever safe), and a ϟ that is unsafe falls through to enemies. "Sooner than that" covers the user's "faster falling shot": a shot that would reach the ship before the drop does.

## Global Constraints

- No package dependencies. Agents code uses `.mjs` and the existing compact one-line style.
- Shared observation and prompt code (`agents/llm.mjs`) is not changed by this plan.
- `sanitizePolicy` keeps stripping unknown keys, so `rules` is not trained or persisted yet. It is passed directly for the simulation.
- `DEFAULT_POLICY` and the saved champion behave exactly as before when `rules` is absent.
- Ship speed 520 px/s, drop fall speed 110 px/s, `lives` max 3, ϟ sets `power = 8`, + sets `invincible = 3` (from `src/engine.js`).

## Review Focus

- **Invincibility** (`ship.invincible > 0`, e.g. right after a +): collisions before it ends are harmless and must not make a drop look unsafe → test in Task 2.
- **Wingman ship:** the rules must read `lives`/`power`/position from the `ship` argument, not `game.player` → test in Task 2.
- **Several drops of one kind:** choose the safe one the ship reaches soonest, not the first in the array → test in Task 2.
- **No enemies on screen** (between waves) while a drop falls: the drop is still collected; with no drops the target stays the existing 480 → test in Task 2.
- **Drop already below the ship's row or out of reach:** ignored, falls through to enemies → test in Task 2.

---

### Task 1: Share the shot-collision prediction

**Files:**
- Modify: `agents/policy.mjs` (`safeX`)
- Test: `test/server.test.mjs`

**Interfaces:**
- Produces: `shotThreats(game, ship, horizon, margin) -> Array<{shot, times: number[3], reach: number}>` and `firstCollision(ship, threats, x, after = 0) -> number` (seconds until the first hit at or after `after` when the ship moves to `x` at 520 px/s and stays there; `Infinity` if none). Both exported.

- [ ] **Step 1: Record the current behavior.** Run `node -e "import('./agents/policy.mjs').then(async p=>{const {benchmarkPolicy}=await import('./agents/train.mjs');console.log(JSON.stringify(benchmarkPolicy(p.DEFAULT_POLICY,{seeds:[1,2,3],seconds:60})))})"` and note the `level`, `seconds` and `score`.
- [ ] **Step 2: Write the regression test** `safe dodging is unchanged by sharing the collision prediction`. It asserts `benchmarkPolicy(DEFAULT_POLICY, {seeds:[1,2,3], seconds:60})` deep-equals the values from Step 1. Add a second assertion: with one enemy shot directly above the ship, `firstCollision(ship, shotThreats(game, ship, 2, 4), ship.x)` is finite, and with `after` set past it, it is `Infinity`.
- [ ] **Step 3: Run it.** `npm run test:server -- --test-name-pattern="collision prediction"`. Expected: FAIL, because `shotThreats` is not exported.
- [ ] **Step 4: Extract the functions.** Move the threat list and the `collision` closure out of `safeX` into `shotThreats` / `firstCollision` unchanged. The only addition is skipping sample times `t < after`. `safeX` calls them with `params.dodgeHorizon`, `params.safetyMargin` and `after = 0`.
- [ ] **Step 5: Run all server tests.** `npm run test:server`. Expected: 14 pass.
- [ ] **Step 6: Commit.** `git commit -am "Share the shot-collision prediction between dodging and target choice"`

### Task 2: Priority rules for drops

**Files:**
- Modify: `agents/policy.mjs` (new `ruleTarget`, one line at the top of `policyTarget`)
- Test: `test/server.test.mjs`

**Interfaces:**
- Consumes: `shotThreats`, `firstCollision` (Task 1).
- Produces: `ruleTarget(game, ship, params) -> {targetX: number, fire: true, reason: 'life' | 'triple' | 'enemy'}`, exported. `policyTarget` returns it when `params.rules === true`, so `policyInput`, the distillation teacher and the LLM `oracle` all follow the rules when given such params.

- [ ] **Step 1: Write the failing tests.** Add one test, `drop priority rules`, using `const g = new Game(() => .5); g.reset(); g.shots = []`, `const R = {...DEFAULT_POLICY, rules: true}`, ship `s = g.player`, and drops shaped `{id, x, y: 300, w: 24, h: 24, type}` (`'shield'` is +, `'rapid'` is ϟ). Assert `ruleTarget(g, s, R)`:
  - `lives = 2, power = 0`, + at `s.x + 200`, ϟ at `s.x - 100` → `{targetX: s.x + 200, reason: 'life'}`.
  - same, plus an enemy shot `{x: s.x + 200, y: s.y - 260, vx: 0, vy: 300, w: 8, h: 18, friendly: false}` → `reason: 'triple'`, `targetX: s.x - 100`.
  - same unsafe +, but `s.invincible = 5` → `reason: 'life'`.
  - `lives = 3`, only a safe + → `reason: 'life'` (a + is worth taking even with full lives).
  - no drops → `reason: 'enemy'`, and `targetX` equals `policyTarget(g, s, {...DEFAULT_POLICY, rapidValue: 0, shieldValue: 0}).targetX`.
  - `lives = 3, power = 3`, only a ϟ → `reason: 'enemy'`.
  - two ϟ at `s.x + 300` and `s.x - 60`, `power = 0` → `targetX: s.x - 60`.
  - ϟ at `y: s.y + 10` (below the ship) or at `s.x + 450, y: s.y - 60` (out of reach) → `reason: 'enemy'`.
  - `g.enemies = []`, ϟ at `s.x + 100` → `reason: 'triple'`; with no drops → `targetX: 480`.
  - wingman: `g.coop = true; g.reset()`, `g.wingman.power = 0`, `g.player.power = 3`, ϟ near the wingman → `ruleTarget(g, g.wingman, R).reason === 'triple'`.
- [ ] **Step 2: Run it.** `npm run test:server -- --test-name-pattern="drop priority"`. Expected: FAIL, because `ruleTarget` is not exported.
- [ ] **Step 3: Implement `ruleTarget`.** For each tier in order (+ always, then ϟ when `ship.power <= 0`), take that tier's drops with `drop.y < ship.y` and `|drop.x - ship.x| / 520 <= (ship.y - drop.y) / 110`. Sort them by `|drop.x - ship.x|` and return the first that is safe: `firstCollision(ship, shotThreats(game, ship, Math.max(params.dodgeHorizon, (ship.y - drop.y) / 110), params.safetyMargin), drop.x, ship.invincible) === Infinity`. Otherwise return the enemy target from `policyTarget(game, ship, {...params, rules: false, rapidValue: 0, shieldValue: 0})` with `reason: 'enemy'`. Always `fire: true`. In `policyTarget`, add `if (params.rules) return ruleTarget(game, ship, params);` as the first line.
- [ ] **Step 4: Run all server tests.** `npm run test:server`. Expected: 15 pass.
- [ ] **Step 5: Commit.** `git commit -am "Add priority rules for collecting drops only when it is safe"`

### Task 3: Simulate rules against value-based drop chasing

**Files:**
- Create: `agents/rules-sim.mjs`
- Modify: `package.json` (`"sim:rules": "node agents/rules-sim.mjs"`), `docs/LEARNING.md` (short "Drop priority rules" paragraph with the results)

**Interfaces:**
- Consumes: `policyInput`, `policyTarget`, `seededRandom`, `levelProgress` (`agents/policy.mjs`); `ruleTarget` (Task 2); champion params from `${DATA_DIR || '.data'}/policy.json`.
- Produces: CLI `node agents/rules-sim.mjs [values] [rules] --games 200 --seconds 600 --first-seed 950001 --parallel 4`. The seeds are disjoint from training (`1e6+`), the policy benchmark (`900001+`) and the LLM benchmark (`700001+`).

- [ ] **Step 1: Write the script.** `values` plays the champion params as saved. `rules` plays `{...champion, rules: true}`. Both play the same seeds through `policyInput(game, game.player, params)`, split across `--parallel` `worker_threads`. Per game, count `power` events (`shield` → +, `rapid` → ϟ) and `damage` events. A hit counts as "while chasing a drop" when, on the tick before it, `policyTarget` aimed at a drop's x. Print one line per pilot: `level · game length · + per game · ϟ per game · hits per minute · % of hits while chasing a drop · wall time`.
- [ ] **Step 2: Smoke run.** `npm run sim:rules -- --games 4 --seconds 60`. Expected: two lines, no errors. `rules` reports non-zero + and ϟ.
- [ ] **Step 3: Full simulation.** `npm run sim:rules -- --games 200 --seconds 600`. Record both lines.
- [ ] **Step 4: Document the result** in `docs/LEARNING.md`: the rules, the command, and both result lines, including a worse result if that is what happens.
- [ ] **Step 5: Commit.** `git add agents/rules-sim.mjs package.json docs/LEARNING.md && git commit -m "Simulate drop priority rules against value-based drop chasing"`

## After the simulation (decided with the user, not part of this plan)

- If the rules win: make them the default (`rules` in `BOUNDS`, or always on), retrain the remaining parameters with `npm run train`, then teach `space-pilot` with `npm run distill`. The teacher follows `policyTarget`, so the model learns the rules without a prompt change. Optionally state the rules in `DEFAULT_STRATEGY`. That changes the prompt, so the LLM benchmark baseline is redone automatically.
- If they lose: compare where (+ and ϟ per game, hits while chasing). A variant worth trying is refreshing ϟ when `power < 1` instead of only at `power <= 0`.
