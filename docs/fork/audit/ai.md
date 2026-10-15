# Audit: AI players (forge-ai)

> Archived agent report, 2026-10-15. Baseline commit `0b0f7ecc511` (upstream/master at the time).

The short answer is yes, but only up to a point. A medium effort of 3 to 6 months could make the AI much better at combat and at responding to the opponent. Making it better "by a lot" across every card means a large search-AI project, and it is blocked by engine work that hasn't been done. The first step is to build a benchmark, because nothing can be measured today. All file paths below are relative to the repo root; nothing was changed (`git status` is clean).

## 1. How the AI decides today: almost entirely hand-written rules

- **Choosing a play is greedy.** `AiController.chooseSpellAbilityToPlayFromList` (`forge-ai/.../AiController.java:1594`) sorts the options with a fixed ranking (`ComputerUtilAbility.saEvaluator`, `ComputerUtilAbility.java:246`; it puts the highest mana cost first and applies a few priority tweaks at `:348`). It then plays the first option the rules accept. The code admits this at `AiController.java:1684`: "TODO could continue to try find another with higher rating". The thinking runs on a separate thread with a 5-second limit (`Game.java:102`).
- **One rules class per effect type.** `SpellApiToAi` maps 194 effect types to classes in `forge.ai.ability` (154 files). 33 of them map to `AlwaysPlayAi` and 10 to `CannotPlayAi`, meaning the AI never plays those. All of them go through `SpellAbilityAi.canPlay`, then `checkAiLogic`, then `checkApiLogic` (`SpellAbilityAi.java:72-118`). The default `checkApiLogic` simply plays 80% of the time at random (`:171-178`). The AI calls the random generator 120 times across the module.
- **Combat uses a fixed scale, not search.** `AiAttackController` picks an aggression level from 0 to 6 using thresholds its own comment calls "bad magic numbers" (`:1236-1272`). `AiBlockController` assigns blockers in fixed greedy passes: good blocks, trades, gang blocks, chump blocks (`:188-945`).
- **Mulligans count lands only.** `ComputerUtil.scoreHand` (`:2085-2158`) looks at the number of lands and whether cards are castable. It ignores colours, and it has a special case for the card Living End. `AiCardMemory` is 12 tagged sets of cards.
- **Behaviour profiles.** There are four profile files (`forge-gui/res/ai/*.ai`, about 120 settings each, 114 settings defined in `AiProps`). Experimental differs from Default on 33 values.
- **Per-card special logic is large.**
  - 1,814 card scripts contain `AILogic$` (2,035 uses, 350 distinct values), and 250 contain `AIPreference`.
  - `SpecialCardAi` holds 46 hand-coded per-card classes.
  - There are about 395 places in the AI code that compare logic names as strings.
  - 2,480 card scripts are marked `AI:RemoveDeck:All` (the AI can't play them; 7.3% of 34,089 scripts), 2,383 more are marked `RemoveDeck:Random`, and 70 `RemoveDeck:NonCommander`.

## 2. The simulation AI: real, but shallow, slow, and off by default

- **How to turn it on.** It is not in any profile; none of the `.ai` files mention it. It is a per-player lobby setting with three choices: none (the default), Hybrid or Full (`forge-gui-desktop/.../PlayerPanel.java:418-433`).
- **Full mode** (`SpellAbilityPicker`, `SimulationController`). It tries every sequence of the AI's own plays in the current priority window, up to 3 plays deep (`DEFAULT_MAX_DEPTH = 3`, `SimulationController.java:15`). It tries every target and mode, copies the game for each candidate, and scores the result. There is no time limit: `AiController.java:2114` bypasses the 5-second timeout. It also runs one at a time by design: "MyRandom should be an instance on the game object, so that we could do simulations in parallel" (`SpellAbilityPicker.java:355`).
- **Hybrid mode** (`OnePlaySafetyChecker`, added in upstream PR #11436, July 2026). The normal rules pick the play, then a single one-step simulation can veto it if the position gets worse (`AiController.java:967`).
- **Known limits:**
  - **The opponent never responds.** `resolveStack` just resolves the stack (`GameSimulator.java:263-292`). The stack isn't copied at all because `COPY_STACK = false` (`GameSimulator.java:19`), so the simulation can't evaluate counterspells or responses.
  - **Combat is not searched.** The evaluator copies the game a second time and plays combat forward using the normal rule-based attack and block code (`GameStateEvaluator.java:52-55`). Even in Full mode, attacks and blocks stay rule-based, with only the randomness turned off (`AiAttackController.java:860`, `AiBlockController.java:1278`).
  - **It cheats.** `PRUNE_HIDDEN_INFO = false` (`GameCopier.java:296`), so the copied game contains the opponent's real hand and the real order of both libraries.
  - **Copying is expensive.** Every card is rebuilt from its card script (`GameCopier.java:304-320`), and the code's own TODO calls this "the vast majority of GameCopier execution time". Each scored candidate can cost two full copies.
  - **The scoring is crude** (`GameStateEvaluator.java:118-274`): ±4 per card in hand, ±2 per life point, `50 + 30*mana cost` for any non-creature permanent, and 0 for Auras.
  - Also multiplayer (`:228`) and multi-target TODOs (`SimulationController.java:257`).
- **Activity.** 26 commits touched the simulation package since 2025-10-15, mostly fidelity and speed fixes in July and August 2026. Upstream issue #8273 lists the same gaps: copy the stack, simulate combat, budget mana instead of greedily playing the "best" spell.

## 3. Known weaknesses

- **In the code:** 525 TODOs and 11 FIXMEs. The most are in `ComputerUtil` (37), `AiController` (37) and `AiAttackController` (32).
- **Upstream reports:** 159 open issues are labelled AI (191 closed). I sorted the titles of 93 AI-related open issues:
  - **Card or ability never used: 29.** Examples: #4215 Collected Company, #5897, #6719.
  - **Misplays and wasted resources: 22.** Examples: #4130 discard spell aimed at an irrelevant hand, #4233 evoking Grief into hexproof, #4325, #4501, #12269 accepts lethal commander damage.
  - **Combat: 6.** Examples: #5213 doesn't block and dies, #4656, #4264.
  - **Hangs and slowness: 3.** Examples: #6149, #9317.
- The reports are almost all about individual cards. Strategic mistakes (planning, budgeting mana, playing around tricks, e.g. #12214) rarely get reported but are fixed in code: the greedy choice and the fixed attack scale above.

## 4. Code quality

- **Largest classes (lines):** `ComputerUtil` 3,314, `ComputerUtilCombat` 2,633, `AiController` 2,410, `ComputerUtilCard` 2,320, `ChangeZoneAi` 2,174, `SpecialCardAi` 2,144, `ComputerUtilMana` 1,942, `AiAttackController` 1,835, `PlayerControllerAi` 1,722, `AttachAi` 1,685.
- **Mostly static helpers.** `ComputerUtil`, `ComputerUtilCard`, `ComputerUtilCombat` and `ComputerUtilMana` expose 66, 67, 53 and 19 public static methods, with hidden global state (`MyRandom` holds one static `Random`, `MyRandom.java:36`).
- **Hand-tuned numbers.** `CreatureEvaluator` adds 54 fixed weights (`value = 80`, `power*15`, `toughness*10`, flying `power*10`…). The simulation evaluator keeps its own separate scoring ("TODO: try and reuse evaluateBoardPosition", `GameStateEvaluator.java:119`).
- **Tests.** 35 AI test files with 237 tests. 142 of them cover the simulation; only 8 cover attacks and blocks. In a previous build in the main checkout (revision not checked), all AI suites passed and the median simulation test took 15 ms, on toy boards only.

## 5. Ways to a much stronger AI, ranked by impact versus effort

0. **Benchmark first (1–2 weeks, a prerequisite).** Without it, any of the work below is guesswork. See section 6.
1. **Evaluate, fix and tune what already exists (2–6 weeks, high return).**
   - Run Hybrid against no simulation and Full against Default on a pool of decks, and make the winner the default.
   - Copy the stack (the `COPY_STACK` path already exists) so the AI can consider responses and counterspells.
   - Add a time budget to Full mode.
   - Tune the evaluation weights and the 114 profile settings by self-play. Issue #9128 shows a user already doing this by hand.
   - Main risk: noise. The rule AI is random, so each comparison needs hundreds of games.
2. **Search over combat (4–8 weeks, highest impact for creature decks).** Today attacks and blocks are a fixed scale plus greedy passes. Enumerate sets of attackers (with pruning), answer each with the existing blocker AI, and score with the combat-prediction code already in `ComputerUtilCombat` (cheap) or with game copies (accurate but slow). Risks: too many combinations with large boards, and tricks after blocks.
3. **Deck-aware game plans (4–8 weeks, medium impact).** `AiDeckStatistics` only knows mana statistics. Nothing in `forge-ai` knows about deck archetypes; `forge-lda` is only used for deck generation. Picking a profile per archetype ties in with upstream #8268. This is cheap but only shifts aggression, it doesn't add understanding.
4. **Search AI with hidden information, i.e. ISMCTS (3–6+ months, high risk).** The building blocks exist: `GameCopier`, `devAdvanceToPhase`, and a score check that copies match (`GameSimulator.java:77-94`). Missing:
   - sampling the opponent's hidden cards instead of reading them (the pruning switch exists but is off);
   - opponent decisions inside the search;
   - a fast rollout policy;
   - a cheap copy (today cards are rebuilt from scripts);
   - thread safety: global `MyRandom`, plus static ID counters `Game.maxId` and `SpellAbility.maxId` (`Game.java:69`, `SpellAbility.java:79`). Upstream PR #11285 and issue #11260 are open and unmerged.

   The AI also has 117 decision points to answer (`PlayerController` has 113 abstract methods). Copy cost per search step is the deciding factor, and I couldn't measure it.
5. **Machine-learned evaluation via self-play (6–12+ months, research project).** It needs a step-by-step "observe / legal actions / act" API. Upstream PR #11627 (headless module) is open, and an RL researcher there is asking for exactly this. Throughput is limited by game speed, which I haven't measured. It only makes sense after item 4's engine work.

## 6. Benchmarking AI against AI without the UI: it exists but is thin

The entry point is `forge.view.Main` with the first argument `sim` (`Main.java:103`), which calls `SimulateMatch.simulate`:

```
forge sim -d <deck1[.dck]> <deck2[.dck]> [-D deckDir] [-n games] [-m bestOf] [-f format] [-s seed] [-a ProfileP1 ProfileP2] [-c timeoutSec] [-q]
```

It also has a tournament mode (`-t Bracket|RoundRobin|Swiss`, `-p` players). The `-a` per-player profile option is upstream PR #11442, and seeding is #11365. Gaps:

- There is no way to turn on the simulation AI from the command line. `createAiPlayer` is called without any simulation option (`SimulateMatch.java:158`).
- It prints one line per game and never totals the win rate (`:246-248`).
- Tournament mode ignores `-a` (`:269`).
- Games run one at a time in one JVM.
- Unfinished games count as draws after 120 s by default.

Seeded runs are probably not reproducible, because AI thinking runs on a separate thread and the random generator is global (unverified). Getting a usable harness means: a simulation flag, a win/loss summary, running several JVMs in parallel, and a fixed set of decks.

## 7. Verdict

- **Small (1–2 months):** the harness, tuning of settings and weights, making Hybrid the default if it wins, and fixing the 20–30 worst per-card bugs. Expect a measurable but modest gain that casual players notice mainly through fewer blunders.
- **Medium (3–6 months):** combat search, a simulation that considers responses (stack copy plus counterspells), a time budget, and mana budgeting. This is where "much better" is realistic for creature-based play and interaction. It still won't cover the 2,480 cards marked unplayable for the AI.
- **Large (6–12+ months, uncertain):** ISMCTS with sampled hidden information, fast game copies, and engine-wide thread safety. Only realistic if a copy can be brought down to a few milliseconds. This is the only route to generic understanding across 34k cards, and it means engine work that should go upstream to avoid a permanent fork.

**What I couldn't verify:** I didn't build or run anything because Maven isn't installed here. So the cost of one game copy on a realistic board, games per hour in sim mode, and whether seeded runs reproduce are all unmeasured. Test timings come from an earlier build in the main checkout whose revision I didn't check. Issue categories are from titles only.
