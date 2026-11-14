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

**Not ours to fix:**
- Upstream `master` fails `CardEditionCollectionCardMockTestCase` (Shivan Dragon, SLZ) since upstream PR 12869. Upstream fixed this same test before (PRs 1494, 2053).
- Garruk, Veiled Butcher is handled by upstream issue 12143 and PR 12218.
