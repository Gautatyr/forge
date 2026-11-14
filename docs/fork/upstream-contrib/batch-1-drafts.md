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
