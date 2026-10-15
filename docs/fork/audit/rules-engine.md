# Audit: rules engine (forge-game, forge-core)

> Archived agent report, 2026-10-15. Baseline commit `0b0f7ecc511` (upstream/master at the time).

I couldn't run any tests (there is no `mvn` or `mvnw` in this environment), so every finding below comes from reading the code, `git`, and `gh` against Card-Forge/forge. Nothing was modified, and the worktree is clean; the only files I wrote are scratch files in the session scratchpad.

## Verdict first
The engine is old, very large and stringly-typed, but it is serious work. It is not "full of obvious bugs". The hardest parts of the rules (layer dependencies, the Foundations combat change, the new mana-ability rule, LKI) are implemented deliberately and cite CR rule numbers. The open bugs are long-tail corner cases plus a lot of AI weakness. A motivated newcomer can fix card-level and single-mechanic bugs within a few weeks. Fixes to core rules (layers, copy effects, replacement ordering) need months of ramp-up and review from the two core maintainers.

## 1. Architecture
- **Game loop and priority.** `PhaseHandler.mainLoopStep` (`phase/PhaseHandler.java:1047-1175`) checks state-based actions and triggers, then gives priority. It follows CR 117.3c: after a player acts, every opponent must pass again (`:1097`). When all players pass, it either moves to the next step or calls `resolveStack()` (`:1144-1159`).
- **State-based actions.** `GameAction.checkStateEffects` (`GameAction.java:1423-1665`) has one method per CR 704 rule (`stateBasedAction704_5d/q/r/u…`), rechecked in a loop.
- **Triggers.** Triggers are collected, then put on the stack in APNAP order (CR 603.3b) at `zone/MagicStack.java:861-871`, with each controller choosing the order of their own simultaneous triggers.
- **Replacement effects.** `ReplacementHandler.run` (`replacement/ReplacementHandler.java:194-215`) lets the affected player, or the controller of the affected object, choose (CR 616.1). It works through `ReplacementLayer` in order (CantHappen, Control, Copy, Transform, Other — CR 616.1b–d), and re-runs after an "Updated" result (`:256-276`).
- **Continuous effects and layers.** `GameAction.checkStaticAbilities` (`:1099`) applies effects layer by layer, sorted with characteristic-defining abilities first, then by timestamp (`:82`).
  - It detects real CR 613.8 dependencies. Each pair of effects is trial-applied and the results compared (`:1297-1409`), and dependency loops are broken with a JGraphT cycle finder (`:1386`).
  - Layer 7d (switching P/T) is commented out (`StaticAbilityLayer.java:34`). Instead the switch is applied at read time by a parity check in `Card.getNetPower` (`Card.java:4471`), which is correct in effect.
- **Data-driven design.** 34,084 card scripts. There are 203 `ApiType` effects, 148 trigger types, 40 replacement types and 90 static-ability modes. A card is a few lines of key/value text (Lightning Bolt is a single `A:SP$ DealDamage` line; Blood Moon and Opalescence are one `S:Mode$ Continuous` line each).
  - The "interpreter" is string dispatch. `CardProperty.cardHasProperty` is a single **2,087-line** method (`card/CardProperty.java:43-2130`, 314 `property.startsWith/equals` branches). `AbilityUtils.xCount` is **1,329 lines** (`ability/AbilityUtils.java:1569-2898`).
- **Hardcoded per-card Java.** Very little reaches the engine itself. There are 38 card-name checks in forge-game (68 more in forge-ai). Almost all are the AI damage-forecast helpers `Card.staticReplaceDamage` (`Card.java:6239-6311`) and `Player.java:~728-800`, plus Helm of Obedience (`RepeatEffect.java:44`).
  - There are also 36 distinct legacy free-text keywords still checked as strings, e.g. `"CARDNAME's power and toughness are switched"`.

## 2. Rules fidelity
**Implemented correctly or carefully**
- **Foundations removal of damage assignment order:** implemented. `Combat.java:494, 531, 552` skip ordering unless `legacyOrderCombatants` is set, and the preference `LEGACY_ORDER_COMBATANTS` defaults to `"false"` (`ForgePreferences.java:221`).
- **CR 605.1a (a cost or effect that moves library cards stops it being a mana ability):** implemented (`cost/LibraryMovementCostVisitor.java:8`, `SpellAbilityEffect.java:48`). Mana abilities skip the stack (`MagicStack.java:227`).
- **Recent mechanics:** "start your engines" state-based action 704.5z (`GameAction.java` ~`:1591`), Rooms (`CardStateName.EmptyRoom`), Prepared, Omen and Specialize faces (`forge-core/.../CardSplitType.java:7-17`).
- **Commander:** 903.9a return-to-command-zone state-based action (`GameAction.java:1853`). 903.9b is a replacement effect, with separate replacement rules for Oathbreaker and Tiny Leaders (`Player.java:3234-3283`). The 21 commander damage check is Commander-only (`Player.java:2063`).
- **Last known information:** the battlefield and graveyard snapshots in `Game.java:109-260` are used at 149 call sites.

**Approximated**
- **Layer dependencies.** "What the effect does" comparison only exists for layer 2: `generateContinuousEffectChanges` returns an empty list for every other layer (`GameAction.java:1411-1418`). Characteristic-defining abilities skip dependency checks entirely ("dependency with CDA seems unlikely", `:1154`). Layer 3 dependencies are tracked upstream as #9574; the new timestamp rule 613.7n as #8562.
- **Self-replacement effects (CR 614.15 / 616.1a).** There is no replacement layer for them; they are hand-modelled inside individual effects.
- **Simultaneous damage replacement.** One effect is chosen per player, not per event (`ReplacementHandler.java:663`, "TODO should be able to choose different order for each entity").
- **State-based actions are not truly simultaneous.** Destroy and sacrifice happen one after another with static-ability updates held (`GameAction.java:1601-1631`). The recheck loop is also capped at 9 rounds (`:1440`) and then silently stops, while CR 704.3 says repeat until none apply.

**Missing (open upstream, label "Rules compliance", 38 open)**
- Copy exceptions 707.9e–g (#2222).
- Choosing between contradictory zone changes, CR 400.6 (#3581).
- Replacement effects keeping the cause of the original event (#3512).
- Protection-from-spells checks (#5262).
- Daybound + transforming double-faced card copies (#3308).

## 3. Code quality
- **Largest classes (lines):**

| Class | Lines |
|---|---|
| Card | 8,237 |
| CardFactoryUtil | 4,165 |
| Player | 4,126 |
| AbilityUtils | 4,049 |
| GameAction | 2,924 |
| SpellAbility | 2,703 |
| CardProperty | 2,145 |
| CardView | 1,753 |
| ChangeZoneEffect | 1,705 |
| GameState | 1,461 |
| Game | 1,452 |
| PhaseHandler | 1,342 |
| CardState | 1,146 |
| StaticAbilityContinuous | 1,139 |
| Cost | 1,133 |

- **God objects:** `Card` has about 1,005 method declarations and 120 private fields; `Player` has 423 methods.
- **Code markers in forge-game:** 219 TODO, 6 FIXME, 0 HACK or XXX. That is low for this size.
- **Exceptions:** 2 truly empty catches in forge-game (`CardTraitBase.java:576`, `Match.java:301`) and 47 catch blocks overall. Most broad catches log to Sentry and carry on, e.g. `Card.java:2773`, `CountersMoveEffect.java:94`, which quietly does nothing when a script names an invalid counter type.
- **Static mutable state:** non-atomic `static int maxId` with `++maxId` in `Game.java:68`, `SpellAbility.java:78`, `Trigger.java:55`, `StaticAbility.java:54`, `ReplacementEffect.java:50` and `SpellAbilityStackInstance.java:41`. Upstream already tracks this (#11260, "Move nextId statics into Game methods").
- **Engine behaviour set from the UI:** a UI global changes engine behaviour. `FlipOntoBattlefieldEffect.boardDecidesHits` is set only by the mobile client (`forge-gui-mobile/.../MatchController.java:93`), so the Chaos Orb corner-hit odds differ between desktop and mobile.
- **Threading:** the engine runs on its own "Game-N" thread pool (`forge-core/.../ThreadUtil.java:25, 43`). UI threads read `TrackableObject` view models, which are backed by a plain `EnumMap` (`trackable/TrackableObject.java:44`); `Tracker` says it is "Not thread-safe — game thread only" (`Tracker.java:29`). The AI, however, evaluates game state from parallel worker threads (`forge-ai/.../AiAttackController.java:883`). Races there were patched in July 2026 (`1f0a3e08158`, #11161).

## 4. Concrete defects and suspicious code
1. **Mishra (Vanguard) damage forecast never fires.** `Card.java:6302` and `Player.java:801` test `c.isCreature()` on the Vanguard card itself, which is never a creature. It should test `source.isCreature()` (the script says `ValidSource$ Creature.YouCtrl`, `cardsfolder/m/mishra.txt`). Failure: the AI underestimates doubled creature damage when Mishra is active.
2. **Damage forecasts restricted to creatures when the card isn't.**
   - Pyromancer's Swath: `Card.java:6248` requires `isCreature()`, but the oracle text says "a permanent or player".
   - Ghosts of the Innocent (`:6275`) and Divine Presence (`:6283`): same mismatch.
   - Failure: the AI misjudges planeswalker and battle damage.
3. **State-based action loop capped at 9 rounds** (`GameAction.java:1440-1641`). Failure: a cascade needing more than 9 rounds leaves the remaining state-based actions unapplied until the next priority check, which is a CR 704.3 violation.
4. **Layer dependency blind spot** (`GameAction.java:1411-1418`). Failure: two effects in the same layer (other than layer 2), where one changes what the other does but not which objects it applies to or whether it exists, are applied in timestamp order instead of dependency order.
5. **Suspicious, not proven:** the static, non-atomic `nextId()` counters combined with the parallel AI evaluation at `AiAttackController.java:883`. Any task that creates `SpellAbility`, `Trigger` or other ID-carrying objects concurrently can produce duplicate IDs.
6. **AI priority loop exit** (`PhaseHandler.java:1117`). An AI that acts 999 times in one priority window is treated as passing. This is a deliberate guard, but it hides AI infinite loops.

## 5. Upstream bug landscape (Card-Forge/forge, queried 2026-10-15)
- **476 open issues.** Labels: Game Mechanics 194, AI 159, GUI 57, BUG 38, Rules compliance 38. 434 of 476 carry `keep`, which exempts them from the stale bot.
- **Age:** median open age 725 days; oldest from 2022-04-16. Opened by year: 2022 40, 2023 120, 2024 94, 2025 116, 2026 106.
- **Recurring themes** in the 220 Game Mechanics / Rules / BUG titles: layers and static effects 27, mana and cost 18, crashes and exceptions 13, combat 12, triggers 7, replacement effects 7, split / adventure / Room 7.
- **Throughput is high.** In the last 1,000 closed issues (2025-06 to 2026-10), median time to close is 2 days, 56% closed within 7 days, and closed BUG-labelled issues have a median of 0 days. What stays open are design-level items.
- **Activity:** 616 forge-game commits and 1,207 card-script commits in the last year. Two people wrote 333 of the 616 forge-game commits (tool4ever 182, Hans Mackowiak 151), so the bus factor is low.

## 6. Tests
- **Volume:** 566 `@Test` methods in total, but forge-game has only 2 test files (`AbilityKeyTest`, `ManaCostBeingPaidTest`). The engine tests live in `forge-gui-desktop/src/test`:
  - `ai/simulation/GameSimulationTest` (78 tests, 3,047 lines).
  - `gamesimulationtests/comprehensiverules/ComprehensiveRulesSection103/104`.
  - `game/replacement`, `game/trigger` and `game/spellability`.
- **CI:** runs `mvn -U -B clean test` under Xvfb (`.github/workflows/test-build.yaml:29`).
- **Writing a regression test.** Extend `AITest` or `SimulationTest`, then:
  1. Build the board with `initAndCreateGame()` and `addCard`/`addCardToZone`.
  2. Set the phase with `devModeSet(...)`.
  3. Resolve an inline script with `AbilityFactory.getAbility("DB$ …")` and `AbilityUtils.resolve`.
  4. Assert on the result.

  `SimultaneousEntryReplacementTest.java` is a complete 54-line template with three rules tests.
- **Puzzles and scenarios.** There are 375 puzzle files in `forge-gui/res/puzzle` using a `[state]` text format (`humanbattlefield=…|Counters:…`). This is the same format `GameState.parse` reads (`GameState.java:514-611`) and that developer mode dumps and loads (`PlayerControllerHuman.java:3021, 3048`). **No test loads a `.pzl` or GameState file today.**

## 7. Can a newcomer realistically fix rules bugs?
Yes, for most bugs. Roughly:
- **Days:** card-script fixes, which are most "card X doesn't work" reports.
- **1–3 weeks:** single-effect Java fixes in `ability/effects/*Effect.java`.
- **Months:** layers, copy effects and replacement ordering. These need deep knowledge of `GameAction.checkStaticAbilities`, LKI and `Card` state, and core maintainers' review.
- **The real learning curve is the script vocabulary.** Its meaning is defined by the 2,000-line string dispatchers rather than any formal grammar, so you learn it by reading `CardProperty`/`AbilityUtils` and grepping similar cards.

**Workflow I'd recommend:**
1. Reproduce in developer mode with "Setup Game State" and save the state text.
2. Turn it into a test in `forge-gui-desktop/src/test/.../game/<area>/`, following `SimultaneousEntryReplacementTest`.
3. Fix the script first; change Java only if the effect API cannot express the card.
4. Run the module tests, then upstream the fix, since maintainers close fixes within days.

**What I'd do first, ranked by impact:**
1. **Add a harness that runs GameState or puzzle files as tests** and assert end states. This is cheap and turns the 375-file puzzle format into a regression corpus.
2. **Fix #1 and #2 from section 4** (one-line fixes in AI forecasts) as a first PR to learn the review process.
3. **Leave the static-ID and AI-threading problems to upstream #11260** rather than fixing them in the fork.

## Not verified
- I could not build or run the tests (no Maven available), so test pass rates and runtimes are unknown.
- None of the defects in section 4 were reproduced in a running game.
- The issue figures for closed issues cover only the last 1,000 closed (June 2025 onward), and the `keep` label inflates the open-issue ages.
