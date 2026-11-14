# Simulation speed options (research report, 2026-11-14)

> Archived research-agent report for the MTG model brainstorm ([README](../README.md)). Verbatim except the title; claims are as of 2026-11-14 and each cites its source. Not a decision.

I found one Rust port of Forge that reads Forge's own card scripts, and several fast Rust engines. All of them are young and none matches Forge's rules. The evidence says engine design matters far more than language: Java to Rust is worth about 1.5–3× on this kind of code, while design changes are worth 10–1000×.

## Key findings
- **The 36 s figure measures Forge's heuristic AI, not `GameCopier`.** `sim` turns on Flat Monte Carlo only with `-mc` (`SimulateMatch.java:95-113`). It creates AIs without a simulation option (`SimulateMatch.java:184` → `GamePlayerUtil.java:62-64`, options `null`). Desktop matches do run Flat MC by default (`ForgePreferences.java:215`, added by upstream PR 12308 on 2026-10-24), and that path copies the game. In self-play a learned policy replaces Forge's AI, so the number that matters is the engine-only cost. Nobody has measured it yet; the profiling run should answer it.
- **Option 2 is already being tried.** Manabrew (`witchesofthehill/manabrew`) is a Rust port of Forge's engine that reads Forge scripts. It started 2026-05-18 and has about 1,400 commits. Its engine crate is 766 `.rs` files and 5.6 MB of source, more than forge-game's 5.0 MB of Java. Its README says it "works for selected matchups", and its Java-vs-Rust parity harness is marked "DEPRECATED and NOT FUNCTIONING".
- **"Argentum" is a real engine:** Argentum Engine (`wingedsheep/argentum-engine`), in Kotlin, MIT licence. It ships a reinforcement-learning ("Gym") environment with O(1) game copies. "Jev" is the AI player it drives.

## 1. Existing engines and simulators
Card counts are each project's own figures.

| Engine | Language | Cards | Multiplayer / Commander | Speed (measured) | Licence | Activity |
|---|---|---|---|---|---|---|
| Forge | Java | 34,113 scripts | yes / yes | 36 s per 4-player Commander game, ~1.4 cores (owner's measurement) | GPL-3.0 | daily |
| XMage | Java | 32,000+ | yes / yes | Learning fork: 5.7 games/s across 640 parallel runners (1v1 Pauper, network in the loop) | MIT | daily |
| Argentum | Kotlin (JVM) | 21,756 | free-for-all 2–6; Commander per its backlog (unverified) | ~10 random 1v1 games/s on 8 threads; AI arena ~5 games/s on 8 cores | MIT | since 2026-01, ~17k commits |
| phase.rs | Rust, parses Oracle text | 29,342/36,280; Commander 85% | yes; has a 4-seat AI Commander runner | not published. 38 of 2,000 headless 4-player games crashed (issue 7134, Aug 2026) | MIT/Apache-2.0 | since 2026-03, ~8.7k commits |
| Ironsmith | Rust, compiles Oracle text | claims every legal card works | up to 4 players | not published; no AI opponent | AGPL-3.0 or BSL-1.1 | since 2026-03 |
| Manabrew | Rust port of Forge | "selected matchups" | 4-player parity planned (issue 1088) | not published | AGPL-3.0 | since 2026-05 |
| kiln-mtg | Rust | 402 verified | 4-player Commander first | 17 ms per 4-player game with greedy pilots (2,327 decisions, ~5 µs each); state copy 665 ns | none found | 2026-10 |
| arcana | Rust | 20,590 generated | 1v1 | 5.57 ms per random game (179/s on one core); state copy 14.2 µs | MIT | 2026-04 |
| mage-go | Go | early sets (Alpha to Onslaught) | 2 players only | — | none found | active |

Analogous engines built for learning (other games):

| Engine | Speed | Notes |
|---|---|---|
| ygopro-core + ygoenv (Yu-Gi-Oh) | environment speed not published | C++ engine plus 13,575 Lua card scripts, the same shape as option 2. Its strong agent took 100M+ games, about 32 RTX 4090 GPUs for 5 days. |
| SabberStone (Hearthstone, C#) | ~200 games/s | A purpose-built C++ simulator (483 cards) reached 10,000 games/s on the same task. |
| Fireplace (Hearthstone, Python) | no figure found | — |
| sts_lightspeed (Slay the Spire, C++) | 1M random playouts in 5 s on 16 threads | Covers one character. |
| Pgx (JAX) | 10–100× faster than Python versions | Covers poker, bridge bidding and mahjong only. I found no JAX engine for a rules-heavy card game. |

**Barebones research simulators, and what a model trained there would lose:**
- **Cowling, Ward and Powley (2009–12):** lands and vanilla creatures of one colour, 1v1. The game "focus[es] on creature combat".
- **Legends of Code and Magic:** "only a handful of mechanics", deterministic effects, creatures and items, 6 keywords, 2 lanes, 1v1.
- **What transfers:** combat maths and mana curve.
- **What is lost:**
  - the stack, responses, activated abilities, targets, modes and trigger order;
  - multiplayer politics;
  - any way to represent Forge's 204 effect types.

## 2. Forge's rules engine in numbers
Measured on `develop` at `9466a56b2b1`.

Commands:
- Lines: `find <module>/src/main -name '*.java' -print0 | xargs -0 cat | wc -l`, also run per package.
- Enum entries: grep of the enum bodies, constructors excluded.
- Card scripts: `find forge-gui/res/cardsfolder -name '*.txt' | wc -l`.
- Parameter keys: `grep -oE '\| *[A-Za-z]+\$'` over the scripts, deduplicated.

Results:
- **Module sizes:** forge-game 129,549 lines (823 files), forge-core 28,572, forge-ai 60,847.
- **Card-script interpreter, ~81k lines (~63%):**
  - abilities 33.4k (the effects alone are 27.2k lines in 208 files);
  - triggers 12.1k, spell abilities 8.2k, costs 8.0k, static abilities 5.8k, replacement effects 3.7k, keywords 2.5k;
  - `CardFactoryUtil` 4.2k and `CardProperty` 2.1k.
- **Core rules and state, ~48k lines (~37%):**
  - card model 16k (`Card.java` alone is 8.2k);
  - top-level package 12.7k (`GameAction` 2.9k);
  - player 7.7k, combat 3.1k, phases 2.1k, zones 1.8k, mana 1.4k.
  - The line between the two is fuzzy: `Card.java` also holds keyword logic.
- **Vocabulary:** 204 effect types (`ApiType`), 149 trigger types, 40 replacement types, 90 static-ability modes, 202 keywords. Scripts use 1,192 distinct `Key$` parameter names.
- **Scripts:** 34,113 card scripts (307,270 lines) plus 857 token scripts.

**Size of a Rust re-implementation (my estimate):** about 130–160k lines of Rust. Manabrew's crate is already that size and is not finished after six months. For us that means 1–2+ years to reach parity, then a permanent cost to keep up with upstream's changes to forge-game.

## 3. Java versus Rust
- **Benchmark study (Pereira et al. 2021):** relative run time C 1.00, Rust 1.04, Java 1.89.
  - On binary-trees, the test that allocates many short-lived objects: Rust 1,263 ms and 180 MB, Java 3,306 ms and 1,120 MB.
  - Benchmarks Game 25.03, same test: Rust 1.07 s against Java compiled to native code 3.90 s.
- **A real Java-to-Rust rewrite (FastQC, Oct 2026):**
  - 3.9–5.2× less CPU and 3–10× less memory.
  - The report credits the redesign (threads, SIMD, reused buffers) rather than the language. The parallel design was also ported back to Java.
- **Design dominates:**
  - Hearthstone: C++ is 50× faster than C#, while the language gap is about 2× (C# 3.14 vs C++ 1.56 in Pereira).
  - Argentum (Kotlin) takes ~500 µs per random action (~2,000 actions/s per thread); kiln (Rust) takes ~5 µs per decision. They measured different workloads, so most of that ~100× gap is design.
  - Argentum's own profile found mana sources rescanned 20–25 times per castable card. Caching them cut action enumeration by 30–40%.
- **What to expect:** about 1.5–3× less CPU and 3–6× less memory from the language alone. Anything beyond that needs a new design: cheap state copies, incremental updates, no UI or event overhead. A port that copies Forge's structure keeps Forge's costs.

## 4. Options
| Option | Card coverage | Fidelity to Forge | Effort | Expected speed-up | Main risks | Useful to Forge? |
|---|---|---|---|---|---|---|
| Barebones simulator | tens to hundreds of simple cards | none | weeks | 10³–10⁵× (C++ Hearthstone 10k games/s; kiln ~60 4-player games/s per core) | learns only combat and curve; large gap to the real game | no |
| Rust engine reading Forge scripts | all 34k in principle | high only with continuous parity testing | 1–2+ years (Manabrew is the yardstick) | 1.5–3× if it mirrors Forge; more needs a redesign, which breaks parity | Forge keeps moving; parity is costly; the engine stays under GPL | low (inference: upstream is unlikely to switch language) |
| Rust for Forge's hot paths only | all | same | months | ≤1.3× overall (inference: Forge's object graph would cross the Java/Rust boundary on every call) | complexity; native builds for desktop and Android | low |
| Optimised Java Forge | all | identical | weeks per step | 2–10× plausible (estimate): several games per JVM, AI out of the loop, cheap copies, caching | depends on the profile; patches must go upstream to avoid merge conflicts | high |
| Reuse an existing engine | 20–30k (their own figures) | different rules engine; unmeasured | months (state encoder, deck import, harness) | unknown to high | young, fast-moving AI-written projects; crash rates; the model must then transfer to Forge | none directly |

## 5. Hybrids
- **Fast simulator for pre-training, Forge for fine-tuning and evaluation.** This only works if both engines expose the same state and action encoding. Rules differences let a policy learn to exploit bugs that exist only in the simulator. The fix is lockstep differential testing (same decks, seed and choices, compare state after each decision). Manabrew built exactly that and then gave it up.
- **Stage 1 of the plan does not hit this wall.** The learned evaluation is supervised and needs positions, not games. 17,000 games a day at hundreds of decisions each gives millions of (correlated) positions a day (estimate). The throughput wall only appears at stage 2, self-play.
- **Once the engine is fast, the neural network becomes the bottleneck.** At ~2,000 decisions per game, 1 ms per network call costs 2 s per game, about 100× kiln's whole engine time. That is why ygo-agent needed GPUs.

## 6. Open questions
1. What does a Forge game cost with a trivial policy instead of Forge's AI? The profiling run should answer this, and it decides between optimising Java and every other option.
2. Can several games share one JVM safely, given the global `MyRandom` and other static state?
3. How many decisions does a 4-player Forge game take? This sets the network's inference budget.
4. Is it acceptable to train on an engine other than Forge, when the end goal is an AI accepted upstream?
5. Licences: Manabrew and Ironsmith are AGPL; kiln has none.
6. phase.rs's throughput is unknown; its `ai-commander` binary could measure it.

**Sources** (all read 2026-11-14):
- github.com/witchesofthehill/manabrew (README, issue 1100, git tree)
- github.com/phase-rs/phase (README, data.phase-rs.dev badges, issue 7134)
- github.com/wingedsheep/argentum-engine (README, `backlog/archived/engine-performance.md`, `docs/ai/measurement.md`)
- github.com/chiplis/ironsmith
- github.com/SeanMcKeen/kiln-mtg (`docs/02 Requirements/Non-Functional Requirements.md`)
- github.com/levineuwirth/arcana (README, `docs/audits/2026-10-06.md`)
- github.com/magefree/mage; github.com/jackmaiorino/mage
- github.com/benprew/mage-go
- github.com/sbl1996/ygo-agent; github.com/Fluorohydride/ygopro-core; github.com/Fluorohydride/ygopro-scripts
- github.com/gamerpuppy/sts_lightspeed
- github.com/gab-25/mtg_gauntlet PR 85
- Świechowski et al. 2018: https://ar5iv.arxiv.org/html/1808.04794
- Cowling, Ward and Powley 2012: https://eprints.whiterose.ac.uk/75050/1/EnsDetMagic.pdf
- Legends of Code and Magic: https://arxiv.org/abs/2305.11814
- Pgx: https://arxiv.org/abs/2303.17503
- Pereira et al. 2021: https://web.fe.up.pt/~jacome/downloads/SCP21.pdf
- Benchmarks Game binary-trees: https://benchmarksgame-team.pages.debian.net/benchmarksgame/performance/binarytrees.html
- FastQC-Rust report: https://ewels.github.io/FastQC-Rust/about/performance/report/
- MageZero FAQ (third-party, unverified): https://www.neura.market/directories/md-directory/architecture-md-magezero-faq-goals-monpkk87
- Unverified throughout: every card count and coverage figure that comes from a project's own badge or README.