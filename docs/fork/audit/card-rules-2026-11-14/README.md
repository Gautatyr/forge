# Card-rules audit of Hugo's Commander decks — 2026-11-14

**Engine tested:** upstream Card-Forge `master` at `29bf33f7a5b` (2026-11-14 08:46 UTC), the same commit as Hugo's installed app (`forge-gui-desktop 2.0.16.r47.g29bf33f`, shows `2.0.17-SNAPSHOT-11.14`).
**Scope:** the 1,136 distinct non-basic cards of the 19 decks in `~/.forge/decks/commander/`, split into 5 groups by deck; one Opus 5.5 high analyst agent per group, ~20–26 min each. Agents triaged by bug risk and wrote TestNG engine tests asserting Oracle/CR outcomes (mostly 3–4 player games, all seats AI-controlled).
**Coverage:** ~300 cards with real assertions (g1 ~75, g2 ~35, g3 77, g4 57, g5 58), 317 tests (87 + 26 + 72 + 71 + 61). The rest were skipped as low risk (≈95 lands per big group, rocks, simple removal) or listed as not reached in each report.

> **Correction (2026-11-14, same day): row 1 is withdrawn — a false positive of the test harness.** The fix agent reproduced it only through `ComputerUtil.playStack`, which skips the priority loop. In real play, `PhaseHandler` (upstream master, around lines 1209–1229) compares the card's zone before and after `playChosenSpellAbility` and fires `triggerChangesZoneAll` for the cast (upstream PR 4585, "Fix Tormod, the Desecrator not triggering from Gravecrawler"). Through the real loop (`PriorityTestBase`, plus `game.copyLastState()` after setup), Imotekh + Muldrotha gives 2 tokens and Tormod + flashback gives 1 Zombie. Casting from hand gives none, and a cancelled flashback gives none. The orchestrator's earlier check covered `moveToStack` only, not its caller. **Lesson:** an audit test that checks a batch (`ChangesZoneAll`) trigger fired by a cast must go through the priority loop, not `playStack`. Scratch tests: fix-agent run, 2026-11-14.

> **Correction 2 (2026-11-14): row 3 (Skyclave Apparition) is withdrawn — Forge follows the official ruling.** Wizards' ruling on Skyclave Apparition (2020-09-25): "If the first ability exiled cards owned by more than one player, each of those players creates a token with power and toughness equal to the sum of the mana values of all cards exiled by the first ability." The two 6/6s are correct. The audit argued from CR 607.2a without checking the card's rulings. **Lesson:** check the card's official rulings (Scryfall "Notes and Rules Information", source `wotc`) before calling anything a rules bug. Row 2 (Fiend Hunter) is *confirmed* by the official rulings on Elesh Norn and Panharmonicon: "the exiled card" refers to all cards exiled by every instance of the trigger.

## Confirmed bugs (each has a failing test; root causes re-checked in the code by the orchestrator; rows 1 and 3 withdrawn, see the corrections above)

| # | Card(s) / deck | What goes wrong | Cause | Upstream | Severity |
|---|---|---|---|---|---|
| 1 | **Any "one or more cards leave your graveyard" trigger** — Imotekh the Stormlord (+ Anrakyr, Muldrotha), Tormod the Desecrator, Quintorius, Desecrated Tomb… (56 scripts) | Casting a card from a graveyard (flashback, Muldrotha, Anrakyr…) never fires the trigger. Effects that move the card (Regrowth, Unearth, Living Death) do fire it. | Engine: `GameAction.moveToStack` (`GameAction.java:854-858`) records no `CardZoneTable`; cast paths `PlaySpellAbility.java:625`, `ComputerUtil.java:118`, `MagicStack.java:144` | not reported | changes outcome |
| 2 | **Fiend Hunter** + Elesh Norn, Mother of Machines / Panharmonicon (Norn deck) | With the ETB doubled, both creatures are exiled but only the last one returns when Fiend Hunter leaves. | Script: `fiend_hunter.txt:6` `ForgetOtherRemembered$ True` → `ChangeZoneEffect.java:517-518` clears the first exile. 65 scripts use this flag (not reviewed). | not reported | changes outcome |
| 3 | **Skyclave Apparition** + Norn (Norn deck) | With the ETB doubled (2-drop and 4-drop exiled from two opponents), each owner gets a 6/6 instead of a 2/2 and a 4/4. | Script: `skyclave_apparition.txt:8,10` one token per owner, X sums all remembered cards. | not reported | changes outcome |
| 4 | **Garruk, Veiled Butcher** (Aminatou, Tam) | While he's out, opponents' creature cards can't be discarded or milled (stay in hand/library); cleanup discard to 7 doesn't work for them. | Script: `garruk_veiled_butcher.txt:5` lacks `Origin$ Battlefield`. | **known: upstream issue 12143, fix in upstream PR 12218 (both open)** | changes outcome |
| 5 | **Narset Transcendent** −2 (Aminatou) | The rebound grant never expires: an instant/sorcery cast from hand on a later turn still gains rebound. | Script: `narset_transcendent.txt:8` lacks `ThisTurn$ True`. | not reported | minor |

## Smaller defects
- **Hapatra, the Desert Fang** (Henzie decks): when an AI casts it, it chooses no target (the card does nothing). Engine is correct with targets chosen. Script `hapatra_the_desert_fang.txt:6` lacks `IsCurse$ True`. Only matters when an AI pilots the deck.
- **Boggart Trawler**: rules text says "Goblin Trawler" (`boggart_trawler_boggart_bog.txt:8`). Cosmetic.

## Not confirmed / AI behaviour (not rules bugs)
- Sneak Attack: AI declined the "may" on resolution; haste and end-step sacrifice untested.
- Henzie: a "Blitz" option may be offered for a creature with mana value < 4; the cast is then correctly rejected. Desktop UI not checked.
- Gatewatch Beacon: AI never moves the counter (`CountersMoveAi.java:201-202`).
- AI never activates a planeswalker ultimate that would leave it at exactly 0 loyalty.

## What was solid
Every commander engine tested worked: Kaalia (+ Isshin), Henzie blitz (+ Chainer from graveyard), Teysa Karlov / Delney / Mondrak, Elesh Norn, Veyran magecraft, Zhulodok cascade (+ Echoes of Eternity), Jodah, Aminatou −6 in 4p, Commodore Guff, Tam, Vnwxt (+ Teferi's Ageless Insight), Prosper Pact Boon, Fynn poison, Kodama + Toggo (partner game, separate tax), Acererak venture, Imotekh (except bug 1), Sythis, Lorehold miracle.

## Files
- `report-g1.md` … `report-g5.md`: per-group reports (tested-correct lists, not-tested lists, harness limits).
- `tests/*.java`: the five test classes. To rerun one: copy it into `forge-gui-desktop/src/test/java/<its package path>/` of a checkout at `29bf33f7a5b` and run `mvn -o -B -pl forge-gui-desktop -am test -Dtest=<Class> -Dsurefire.failIfNoSpecifiedTests=false`.

## Harness lessons (for the next sweep)
- The installed `~/.m2` POMs keep an unresolved `${revision}` parent: `-pl forge-gui-desktop` alone fails offline; always add `-am` (~45–90 s, no install).
- `AITest.addCard` doesn't register triggers or the last-known battlefield; `playUntilStackClear` stops before SBAs and post-resolution triggers. Every agent wrote its own `resolveAll()`/`sync()` helper; reuse them.
- `SpellAbility.canPlay()` ignores "can't be cast" statics (use `checkRestrictions`). AI controllers make every optional choice, so human-only paths stay untested.
- Analyst subagents can write only in their own isolation worktree and cannot write report files: pre-created worktrees were unused; have them return reports as text.
