# Fork documentation

This folder belongs to the fork (Gautatyr/forge), not to upstream Card-Forge. Upstream's `docs/` is their wiki source; nothing here is synced to it.

## Goals of the fork
1. Replace the desktop in-game UI (the "match screen") with a modern web UI. Other desktop screens follow later.
2. Fix rules bugs that matter to us.
3. Make the AI much stronger.
4. Stay current with upstream: new cards and engine fixes keep flowing in.

Audience: the owner and friends, possibly the public later. Never monetised.

## Index
| File | Content |
|---|---|
| [decisions.md](decisions.md) | Decision log. Read this first. |
| [PLAY.md](PLAY.md) | Owner's guide: play a Commander game in the new match screen (`make play`), what works, limits, back to Swing. |
| [design/match-screen-decisions.md](design/match-screen-decisions.md) | Owner's rulings on the match-screen design. Overrides the memo where they differ. |
| [design/playtest-1.md](design/playtest-1.md) | Owner's first real game in the web screen: review and triage. |
| [design/product-decisions-pass-4.md](design/product-decisions-pass-4.md) | Design pass 4: review of the prototype, every screen missing for a full Commander game, implementation split. |
| [design/keyword-icons.html](design/keyword-icons.html) | Approved keyword icon set (Mana font), with names and one-line explanations. Open in a browser. |
| [design/product-decisions-pass-3.md](design/product-decisions-pass-3.md) | Product decisions for mockup pass 3: turn strip and stops, mana payment, keyword icons, card sizing. |
| [design/mockup-review-1.md](design/mockup-review-1.md) | Owner's first review of the mockup, answers to its open questions. |
| [design/mockup-notes.md](design/mockup-notes.md) | Clickable match-screen mockup: how to run it, scenarios, layouts, design choices, open questions. |
| [design/match-screen-memo.md](design/match-screen-memo.md) | Product discovery memo: interaction inventory, pain points, benchmarks, options. |
| [architecture/web-ui.md](architecture/web-ui.md) | Web UI architecture: the engine/UI seam, the existing network protocol, the bridge plan. |
| [architecture/spike-report.md](architecture/spike-report.md) | Web bridge spike: how to run it, measurements, wire format, prompt-bridging design, risks. |
| [audit/desktop-ui.md](audit/desktop-ui.md) | Audit of the Swing desktop UI. |
| [audit/upstream-sync.md](audit/upstream-sync.md) | Module graph, UI/engine seam, upstream churn, fork strategy options. |
| [audit/rules-engine.md](audit/rules-engine.md) | Audit of the rules engine, rules fidelity, known defects, test workflow. |
| [audit/ai.md](audit/ai.md) | Audit of the AI, the simulation AI, improvement paths, the `sim` benchmark CLI. |
| [audit/human-seat.md](audit/human-seat.md) | How the web human seat answers every `IGuiGame` method and `Input`; silent defaults; known gaps (#46). |

## Codebase state (summary, 2026-10-15)
Measured on commit `0b0f7ecc511`.

- About 539k lines of Java plus 34,089 card scripts. Project started in 2007.
- Very active upstream: 3,302 commits from 148 authors in the year to 2026-10-15.
- `mvn -pl forge-gui-desktop -am test` passes in about 2 minutes: 782 tests, 0 failures, 6 skipped.
- Bugs get fixed fast upstream: of the last 1,000 closed issues, half closed within 2 days. The 476 open issues are mostly long-tail rules corner cases and AI weaknesses.
- Weak spots: god classes (`Card.java` 8,237 lines), stringly-typed card scripting (`CardProperty.cardHasProperty` is one 2,087-line method), engine tests living in the desktop module, low bus factor in the engine (2 people wrote 333 of 616 commits).
- The desktop Swing UI is outdated in code terms: forced Metal look-and-feel, raster sprite skin addressed by pixel coordinates, hand-rolled window chrome, minimal HiDPI, MigLayout 4.2, no UI tests. See [audit/desktop-ui.md](audit/desktop-ui.md).
- Headless AI-vs-AI games run at about 1 s per game (10 games, two aggro decks), so AI changes can be benchmarked over thousands of games.

## Development setup
Requirements: JDK 17 (`java-17-openjdk`), Maven (`paru -S maven`), Node and pnpm for the web UI.

```fish
# Compile the desktop app and the modules it needs
mvn -pl forge-gui-desktop -am compile

# Same, plus all tests (about 2 minutes)
mvn -pl forge-gui-desktop -am test

# Headless AI-vs-AI benchmark (run from forge-gui-desktop/)
mvn -pl forge-gui-desktop -am compile dependency:build-classpath -Dmdep.outputFile=target/cp.txt
java -cp "target/classes:"(cat target/cp.txt) forge.view.Main sim -D ../forge-gui/res/geneticaidecks -d "<deck1>.dck" "<deck2>.dck" -n 10 -q
```

Play with the web match screen: `make play` (desktop lobby; Start opens the match in the browser). Steps: [PLAY.md](PLAY.md); internals: `fork-desktop-web/CLAUDE.md`.

The desktop app finds its `res/` folder through `GuiDesktop.getAssetsDir()` (`forge-gui-desktop/src/main/java/forge/GuiDesktop.java:87`): `../forge-gui/` when the version string contains "git", otherwise the working directory.
