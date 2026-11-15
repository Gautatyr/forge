# Upstream contribution candidates (parked)

Noted 2026-11-14. The owner parked these: "we won't be doing them today". None is confirmed as a bug.

**Before any work on a candidate:**
1. Read the official rulings of every card involved (Scryfall, source `wotc`) and the current Comprehensive Rules.
2. Reproduce through the real priority loop (`PriorityTestBase`).
3. Search upstream for an existing PR or issue.

Then follow `docs/fork/audit/upstream-contributing.md` and the owner gate (decision log, 2026-11-14).

| Candidate | What we know | Source |
|---|---|---|
| Admonition Angel, Angel of Serenity, Mesmeric Fiend (maybe Slithery Stalker, already fixed in upstream PR 12875) | A leave-side `ClearRemembered` may empty a flickered permanent's new list, so cards exiled by the new object would never return. This is the same flicker bug PR 12875 fixed for Tidehollow Sculler and Free-for-All. Likely, but untested. | adversarial review of PR 12875 |
| Laquatus's Champion, Soul Scourge | They track a targeted *player*, not an exile. With a doubled enter trigger, both players lose life but only one gains it back (the remembered list is a set). There is no clean script fix. Check CR 607.3 and the rulings first. | Journey to Nowhere fix agent |
| The Crab Queen | Its `Oracle:` line contains a literal `CARDNAME`. Check where that text is displayed. | Boggart Trawler fix agent |
| Thrór's Map | Its `Oracle:` line spells it "Thror's Map" (missing diacritic). Cosmetic. | Boggart Trawler fix agent |
| Shy Town (Planechase plane) | Same shape as Hapatra (opponent-only "up to one" counters, no `IsCurse$ True`). The counter is Neutral, not Negative, and the card is not in the test card database, so the bug is unverified. | Hapatra fix agent |
| Gatewatch Beacon (AI) | The AI never moves the counter (`CountersMoveAi.java` ~201-202 returns CantPlayAi for this untargeted move). AI weakness, not a rules bug. | card-rules audit, g4 |
| Planeswalker ultimates at exactly 0 loyalty (AI) | The AI never activates an ultimate that leaves the walker at 0 (Aminatou −6 at 6, Tevesh −10 at 10, Vraska −9 at 9). Possibly deliberate AI policy. | card-rules audit, g4 |
| Sneak Attack | The AI declined the "you may" on resolution, so haste and the end-step sacrifice were never tested. Unconfirmed. | card-rules audit, g1 |
| Henzie "Toolbox" Torre | A "Blitz" option may be offered for a creature with mana value below 4; the cast is then correctly rejected. Desktop UI not checked. | card-rules audit, g1 |

## Performance candidate (noted 2026-11-15, owner: "we will look into it later")
- **The work:** a CR 601.3e hypothetical static-recompute filter, plus an alternative-cost cache in `GameActionUtil`.
  - Forge's AI spends ~73 % of its CPU in legal-play enumeration: `getAllPossibleAbilities` → `getAlternativeCosts` → `checkStaticAbilities`.
  - The filter skips the per-spell hypothetical recompute when no Continuous static can affect the hypothetical source.
- **Measured:** 1.6× faster 4-player Commander games for Forge's own AI (1.152 → 0.720 s per log turn, seeded games identical); 0 violations in verify mode over 230k skipped calls; 2,546 tests pass.
- **Where:**
  - code on the fork branch `mtg-model/static-probe` (commits `f30097b2be3`, `065888ff281`, training-only flags `-Dmtgmodel.staticFilter` / `-Dmtgmodel.altCostFilter`);
  - evidence in the mtg-model repository, `docs/research/static-probe.md`.
- **Before proposing it upstream:**
  - an Opus review (running);
  - coverage of the OptionalCost branch and a verify sweep over many decks;
  - remove the training-only flags;
  - read upstream's CONTRIBUTING (performance PRs need profiling on 1v1, 4-player Commander and token boards);
  - the owner's go.

## Found by the ML model work (noted from 2026-11-15; owner: "note it down, we may work or report it later")
The work is in the separate mtg-model project. Evidence lives there, under `docs/research/`, and on the fork's `mtg-model/*` branches. Nothing below is confirmed against upstream `master` yet. Each item needs the steps at the top of this file before any upstream write.

| Candidate | What we know | Evidence |
|---|---|---|
| **AI forced attackers are added in thread-finish order** | `AiAttackController` added forced attackers to combat in the order its worker threads finished. Under CPU load the attack order changes, so a seeded game is not reproducible. Fixed on the training branch by adding them in attacker order. | mtg-model `research/determinism-review.md`; fork commit `45624ecf4a0` |
| **AI hangs forever in some games** | With the AI thinking limit lifted, about 1 % of 4-player Commander games never finish. Each hang is deterministic: job 226 hung again at the same turn with a 90-minute limit. One stack trace was inside `AiBlockController.makeGangBlocks`; another game loops on "Moving spell to Hand" at turn 44. With Forge's normal 5 s AI limit these become slow turns rather than hangs. The diagnosis per hang is in progress (task S). | mtg-model `research/baseline-v2.md`, `stall-rule.md` (when done), `g3a-visibility.md` |
| **AI "can I pay / can I play" checks change AI state** | Checking playability, without playing anything, does several things: it draws from the game's random stream (`chooseOptionalCosts` → CharmAi's entwine check); it clears AI memory sets (`canPayCost`, `HELD_MANA_SOURCES_*`); and it overwrites a mana ability's "express choice" (`AbilityManaPart`), which `predictMana` reads back at the next filter-land payment. So merely asking whether a spell is playable can change the AI's later choices. | mtg-model `research/census-inert-review.md` (rounds 1–2) |
| **Global `AiCache` is static** | The cache (`evaluateBoardPosition`, `aiLifeInDanger`, ...) is static and cleared only when an AI starts its next priority decision. It may be shared across games in one JVM. Unverified for real multi-match hosting. | mtg-model `research/census-inert-review.md` |
| **AI playability includes coin flips** | A planeswalker ability that uses all loyalty is refused half the time by a random draw inside the payability check (`ComputerUtilCost` ~597-609). Possibly deliberate AI policy, but it makes "is this legal" answers random. | mtg-model `research/adapter-v2-spec-review-2.md` (finding 3) |
| **AI never casts a graveyard/exile spell that only a cast-zone reduction makes affordable** | The AI's payability check fakes the cast zone but not the casting ability, which reductions like Gravebreaker Lamia's (and Doc Aurlock's) also need. Verified with Lamia and a flashback spell. | mtg-model `research/g2b-review.md` (F1) |
| **Pre-cast cost predictions miss the commander tax** | The engine adds the tax only once the card is being cast. Any cost prediction made earlier misses it unless it fakes the cast zone, as the AI does. | mtg-model `research/g2b-review.md` (F2) |
| **A game that runs out of memory** | Seed 29 game 2 of a G2b test plan, and development-plan job 980, died of `OutOfMemoryError` at `-Xmx3g` in every configuration, recording off included. Likely an AI loop growing a structure. The next step is a heap dump. | mtg-model `research/g2b-legalplays.md`, `baseline-v2.md` |
| **`AiController.confirmPayment` always throws** | The AI never reaches that path; one inventory lists it as an AI path. Low value. | mtg-model `research/g2a-notes.md` |
| **`CardView.toString()` leaks internal ids into composed text** | "Name (123)" ends up in any text Forge composes, such as effect-card names ("Fog (22)'s Effect"), descriptions and stack texts. It looks harmless in the GUI but exposes internal ids, and in a networked game a hidden card's id could be tracked. | mtg-model `research/g3a-review.md` (B2), `g3a-visibility.md` |
| **`CardView.canBeShownTo` zone at a zone-exit event** | The view's zone was null at a zone-exit event, so the visibility agent wrote its own copy with the zone passed in. A possible GUI/view edge case; unverified. | mtg-model `research/g3a-visibility.md` |
| **Performance (see the section above)** | The static-recompute filter is now reviewed twice: 0 violations over all 169 decks, 1.6–1.75× faster Forge AI games. | mtg-model `research/static-probe.md`, `filters-review-2.md` |

**Not ours to fix:**
- Upstream `master` fails `CardEditionCollectionCardMockTestCase` (Shivan Dragon, SLZ) since upstream PR 12869. Upstream fixed this same test before (PRs 1494, 2053).
- Garruk, Veiled Butcher is handled by upstream issue 12143 and PR 12218.
