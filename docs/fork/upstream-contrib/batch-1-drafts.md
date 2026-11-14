# Upstream contributions, batch 1 (2026-11-14) — PR drafts for the owner

Each draft waits for the owner's go before it is posted (decision log, 2026-11-14). Branches are on the fork (`Gautatyr/forge`), based on upstream `master`.

## 1. `contrib/boggart-trawler-oracle` — commit `7048f149ffa`
- Status: ready for the owner. Orchestrator review: diff = 3 `Oracle:` lines; names checked against Scryfall (Boggart Trawler, Great Desert Prospector, Marina Vendrell's Grimoire). CI command passed (2,589 tests, 0 failures, JDK 17).
- Agent notes: the in-game text already used `CARDNAME`; the `Oracle:` line shows in the card catalog and the MDFC combined text. Not checked in a running game. Possible follow-ups, not in this PR: The Crab Queen's `Oracle:` line contains a literal `CARDNAME`; Thrór's Map is written "Thror's Map" in its Oracle line.

**Title:** Fix wrong card names in three Oracle texts (Boggart Trawler and two others)

**Body:**
```
Boggart Trawler's Oracle line said "When Goblin Trawler enters, ..."; it now says "When Boggart Trawler enters, ...". The trigger description already used CARDNAME, so only the Oracle text was wrong.

A scan of all card scripts for Oracle triggers that name another card found two more typos of the same kind, fixed here: Great Desert Prospector ("Great Desert Surveyor") and Marina Vendrell's Grimoire ("Marine Vendrell's Grimoire"). Names checked against Scryfall.

Script text only, so no tests. `mvn -U -B clean test` passes on JDK 17. Not checked in a running game.

Written with Claude Code (co-author on the commit).
```

## 2. `contrib/narset-rebound-this-turn` — commit `7ab646d0869`
- Status: ready for the owner. Orchestrator review: diff = `ThisTurn$ True` added on the −2 line; Bloodrage Alpha and Tenacious Pup (left alone) have no "this turn" in their Oracle. Scripted repro failed before, passes after; CI command passed (2,539 desktop tests, 0 failures).
- Agent note: the AI's `NarsetRebound` logic was not reviewed; the AI activates −2 and casts in the same turn, so the shorter lifetime should not affect it.

**Title:** Narset Transcendent: rebound grant now expires at end of turn

**Body:**
```
The -2 reads "When you cast your next instant or sorcery spell from your hand this turn, it gains rebound." The grant never expired: after activating -2 and passing the turn, an instant cast from hand on a later turn still gained rebound.

Cause: the DelayedTrigger line lacked `ThisTurn$ True`, so it was registered as a permanent delayed trigger. Fix: add the flag. The other SpellCast delayed triggers worded "this turn" already have it; Bloodrage Alpha and Tenacious Pup say "your next ..." with no "this turn" and are left alone.

Checked with a scripted engine scenario (not a hand-played game): -2, pass to another turn, cast Opt from hand. Before, Opt was exiled; after, it goes to the graveyard. Casting in the same turn still gives rebound. Script-only, so no tests; `mvn -U -B clean test` passes.

Written with Claude Code (co-author on the commit).
```

## 3. `contrib/hapatra-ai-targets` — commit `01355a4242d`
- Status: ready for the owner. Orchestrator review: diff = `IsCurse$ True` added to the trigger's PutCounter line. Reproduced through the real game loop (4 AI players, the AI casts Hapatra by itself): before, `targeting []` and all three Angels survive; after, one Angel per opponent is targeted and all die. CI command passed (2,539 desktop tests, 0 failures).
- Agent notes: 61 of 70 targeted M1M1 PutCounter scripts already set the flag. Decimator Beetle and Persistent Constrictor have a similar shape and were tested working (left alone). Shy Town (a Planechase plane) may share the defect but could not be reproduced (not in the test card database), so it was left out.

**Title:** Hapatra, the Desert Fang: AI now targets opposing creatures with its enter trigger

**Body:**
```
When an AI player casts Hapatra, its enter trigger ("for each opponent, put X -1/-1 counters on up to one target creature that player controls") goes on the stack with no targets, so the card does nothing. With targets chosen by hand the engine is correct.

Cause: the PutCounter line lacks `IsCurse$ True`, and `SpellAbility.isCurse()` only checks that parameter. `CountersPutAi.doTriggerNoCost` treats the counters as a bonus and looks only at the AI's own creatures; as the ability is "up to one" (`TargetMin$ 0`), it ends with no target. 61 of 70 targeted -1/-1 counter scripts set the flag (e.g. Ifnir Deadlands). Fix: add it here.

Checked with a scripted engine scenario (not a hand-played game): 4 AI players, the AI casts Hapatra itself through the main loop, with three opposing Serra Angels and a 6-mana card in its graveyard. Before, the trigger targets nothing; after, it targets one Angel per opponent and all three die. Script-only, so no tests; `mvn -U -B clean test` passes.

Written with Claude Code (co-author on the commit).
```

## 4. `contrib/skyclave-apparition-tokens` — commit `11e8b619a06`
- Status: ready for the owner. Orchestrator review: both scripts now loop over the remembered cards (`RepeatEach … UseImprinted$ True`, the idiom of e.g. Desolation) and make one token per card, owned by and sized by that card; the "still exiled" condition is kept per card. Reproduced before the fix through the real game loop (`PriorityTestBase`) and the direct-cast harness; after the fix, 7/7 direct and 4/4 real-loop cases pass. CI command passed (2,539 desktop tests, 0 failures).
- Agent notes: Severance Priest has the same defect and is fixed in the same commit (checked in the direct-cast harness only). The doubled-trigger ruling is a CR 607.2a reading; no official ruling exists.

**Title:** Skyclave Apparition, Severance Priest: one token per exiled card

**Body:**
```
Both cards say "the exiled card's owner creates an X/X ... token, where X is the mana value of the exiled card". When the enter trigger resolves twice (e.g. with Elesh Norn, Mother of Machines), two cards are exiled, and the scripts made one token per owner sized by the sum: Grizzly Bears (MV 2) and Hill Giant (MV 4) from two opponents gave each opponent a 6/6.

Cause: `TokenOwner$ RememberedOwner` makes one token per owner, and `X:Remembered$CardManaCost` sums all remembered cards. Fix: RepeatEach over the remembered cards (`UseImprinted$ True`, as Desolation does), one token per card, owned and sized by that card. Under CR 607.2a the leaves ability refers to every card the linked enter ability exiled; there is no specific ruling for the doubled case.

Checked with scripted engine scenarios, including through the priority loop (not a hand-played game): doubled with two opponents now gives a 2/2 and a 4/4; two cards from one opponent give that opponent both tokens; single exile, nothing exiled, and a card that already left exile are unchanged. Script-only, so no tests; `mvn -U -B clean test` passes.

Written with Claude Code (co-author on the commit).
```

## 5. `contrib/fiend-hunter-doubled-etb` — commits `e59f2d749dc` + `6ca10fe1007`
- Status: ready for the owner. Round 1 (clear-on-enter for all four cards) got "changes needed" from an independent adversarial review: the engine already tracks the exiling permanent (`ExiledWith`, used by Oblivion Ring and Faceless Butcher), and the round-1 version left two flicker bugs (Ephemerate on Tidehollow Sculler, Flicker of Fate on Free-for-All). Round 2 switches Fiend Hunter, Tidehollow Sculler and Free-for-All to `ExiledWith`/`ExiledWithSource`; Search the City keeps a clear-on-enter static trigger (its other abilities need the list).
- Orchestrator review: final diff = 4 scripts, 11+/11−, matching the reviewer's prescription. 16 real-loop scenarios pass (doubling by Norn and Panharmonicon, Clone copy, Ephemerate after the exile and in response to the enter trigger, Free-for-All upkeep, Search the City with and without Norn, no doubling, early leave); 8 of them fail without the fix. CI command passed (2,589 tests). Upstream has not touched these files since the branch base. Two commits; upstream squash-merges.

**Title:** Fiend Hunter, Tidehollow Sculler, Free-for-All, Search the City: keep every card exiled by a doubled enter trigger

**Body:**
```
When Elesh Norn, Mother of Machines (or Panharmonicon, for the two creatures) makes the enter trigger fire twice, ForgetOtherRemembered$ on the second resolution wiped the cards the first one exiled (CR 607.2a: the leave ability refers to all of them). Fiend Hunter and Tidehollow Sculler: when they leave, only one card comes back. Free-for-All: the second trigger exiles nothing and empties the list, so no creature ever comes back at upkeep or goes to the graveyard. Search the City: only five of the ten cards count.

Fix: Fiend Hunter, Tidehollow Sculler and Free-for-All now use ExiledWith / ExiledWithSource, like Oblivion Ring and Faceless Butcher, instead of a remembered list. This also fixes flickering them after the exile (Ephemerate on Sculler, Flicker of Fate on Free-for-All), where the old leave trigger's cleanup emptied the new permanent's list. Search the City still needs its list (its triggers match names against it), so it drops the flag and clears the list when it enters, with a static trigger as Naya Soulbeast does.

Tested in scripted headless games through the real priority loop, not by hand: each card doubled by Norn failed before and passes after; Fiend Hunter also with Panharmonicon and as a Clone copy; Ephemerate after the exile, and in response to the enter trigger (that card stays exiled); Free-for-All's upkeep return. `mvn clean test` passes. No tests added (script-only change).

Journey to Nowhere and a few similar scripts lose cards the same way through ForgetOtherTargets$; I'll send those separately.

Written with Claude Code (co-author on the commit).
```
