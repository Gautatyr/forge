# MTG model: brainstorm map (2026-11-14)

**Status: brainstorming.** Nothing is decided. No external contact, no code. This page maps the options and the evidence; the research reports are in [research/](research/). The earlier Forge-centred analysis ([../audit/ml-ai-feasibility.md](../audit/ml-ai-feasibility.md)) is background; its sections 7–8 (recommendation, staged path) were not accepted.

## 1. The owner's goals, constraints and ideas
- **Goal:** a better AI that plays more realistically, like a human. Difficulty levels and personalities later. The way we get there matters.
- **Constraints:**
  - It runs on the player's computer, offline, at zero running cost; a modern graphics card may be the minimum requirement.
  - It must eventually be playable in the official Forge, not in a fork build.
  - An LLM is not the player.
- **Ideas (owner, 2026-11-14):**
  - Build a high-level MTG model, usable outside Forge too, and connect it to Forge through an adapter.
  - Don't train only on Forge's AI: it is a weak opponent.
  - Look at many resources before deciding.
  - Speed up simulation:
    - a barebones simulator;
    - a Rust rewrite of what is slow;
    - cheap cloud machines (a couple of euros a month at most).
  - Judge the engine's speed against the model's own "speed of thought" (section 3).

## 2. What we measured (owner's PC: Ryzen 7 5800X3D 8 cores/16 threads, 32 GB, Radeon RX 7800 XT 16 GB)
- **Forge AI-vs-AI, 4-player Commander** (Kaalia, Norn, Teysa, Zhulodok; 8 games, seed 42):
  - 35.7 s per game on average (17–107 s), 22 turns;
  - per game: ~46 spells, ~16 activations, ~75 triggers, ~15 attackers;
  - one JVM used ~1.4 cores and 1.2 GB.
  - The same seed gave different games in a second run, so seeded runs are not reproducible.
- **Profile of those games** (Java Flight Recorder, 4 games, 16,895 CPU samples):
  - 90 % of samples have Forge AI code on the stack. Only 3.6 % of those are the engine carrying out a play the AI already chose.
  - So **~87 % of the time is Forge's AI deliberating and ~12 % is the rules engine**: about 4–5 s of engine work per game (estimate).
  - Inside the engine, ~70 % of samples are under static-ability or state-based-action recomputation. That is a design hot spot whatever the language.
- **Model inference on CPU.** A numpy transformer on one core, 128 tokens (one token per visible object):
  - 0.4M parameters: 22 ms; 3M: 134 ms; 19M: 773 ms; 85M: 3.3 s per decision.
  - These timings are **about 10× too slow to use as such**. numpy here uses the reference `cblas` (7 GFLOPS on one core; an optimised BLAS reaches roughly 50–100). They are consistent with the operation counts used in section 3.
  - GPU inference was not measured: no PyTorch installed.

## 3. Where the time goes once Forge's AI is replaced (the owner's framing)
Time per game = engine time + model calls × time per model call (+ search, if the model looks ahead).

Assumptions:
- ~1,500 model calls per 4-player game. kiln-mtg measured 2,327 decisions per 4-player game in its own engine; Forge is unmeasured. Forced decisions (one legal action) need no call.
- Forge's engine: ~4.5 s per game.
- Model sizes as in section 2.
- CPU: optimised BLAS, 50–100 GFLOPS per core (estimate).
- GPU: many games batched together, 10–20 TFLOPS effective on the RX 7800 XT (estimate, not measured).

| Model | Work per call | Model time per game, CPU (1 core) | Model time per game, GPU batched | Bottleneck with Forge's engine (4.5 s) |
|---|---|---|---|---|
| tiny, 0.4M parameters | 0.12 GFLOP | ~2–6 s | ~0.02 s | GPU: engine. CPU: even |
| small, 3M | 0.86 GFLOP | ~15–25 s | ~0.1 s | GPU: engine. CPU: model |
| medium, 19M | 5 GFLOP | ~1.5–2.5 min | ~0.4–0.8 s | GPU: engine. CPU: model |
| large, 85M | 22 GFLOP | ~5–11 min | ~2–3 s | GPU: both. CPU: model |

What follows:
- **Training with a GPU: the engine is the bottleneck,** as the owner said. Forge's engine alone allows ~1.8 games/s on 8 cores, about 150,000 games a day (estimate).
  - The GPU can serve ~7–15 games/s with a small model, but only ~1.3–2.7 with a medium one.
  - So a faster engine pays off up to the GPU's limit for the chosen model size.
- **Search multiplies the engine's share.** Search means the model looks ahead (MageZero, Forge's Flat Monte Carlo, AlphaZero-style). Each decision then costs N simulated continuations, plus a game copy each.
  - Forge's copy rebuilds every card from its script (cost not measured).
  - kiln-mtg's copy takes 665 ns.
  - With search, engine and copy speed are almost the whole story.
- **Playing against humans, latency hardly matters.** 0.1 s per decision is invisible to a player. Even a CPU-only medium model, or a GPU large model, is fine. Training is what needs speed; playing does not.
- **Design lever:** an NNUE-style incremental encoding (re-encode only the objects that changed since the last decision) cuts CPU cost per call a lot. This shapes the model architecture.

## 4. Findings per question
### 4.1 Is there a bank of recorded human Commander games? ([research/human-game-data.md](research/human-game-data.md))
- **No public one.**
  - Playgroup.gg holds the only real corpus: 780,000+ logged paper games (outcomes, life, eliminations) and ~26,000 online games a month with card-level casts. It is private; access means asking them.
- **Public, but not Commander:**
  - 17lands: Arena Limited, per-turn summaries, ~23M games, CC BY 4.0.
  - MTGO PDBot logs: ~61,000 1v1 matches with targets.
  - Arena's own log for a player's games, including Brawl (1v1, 100 cards): full state, but you must collect it yourself.
- **Not human:** 37,000 Forge AI-vs-AI Commander game logs on Hugging Face (MIT).
- **Scale reference:**
  - Maia used 12M games per skill band.
  - A personal style model needed at least 5,000 games per person.
  - Diplomacy's imitation model used 150,000+ games.
  - So our group's games would serve to **check and anchor** human-likeness, not to train from scratch.

### 4.2 Past MTG models to learn from, start from, or test against ([research/prior-work.md](research/prior-work.md))
**Recent open MTG projects (2025–2026, all 1v1 so far):**
- **MageZero** (MIT): AlphaZero-style search plus a graph network over game entities; an open, hashed card vocabulary; one head per decision type; XMage.
- **jackmaiorino** (MIT):
  - PPO with a curriculum of opponents, on XMage;
  - mtg-kernel, a Rust engine;
  - Spellbench, an engine-neutral bot protocol with Elo boards;
  - Archon 2 weights on Hugging Face (1.23M parameters).
- **Argentum Engine** (Kotlin, MIT): 2–6 players, a gym API, instant state copies, an AlphaZero-style search interface.
- **A Forge HTTP bridge** for 2–4-seat Commander (gab-25/mtg_forge_engine, GPL).

No public MTG AI handles 4-player Commander.

**Analogues:**
- **ygo-agent** (Yu-Gi-Oh!, ~13,500 cards, LLM text embeddings for cards): 100M+ games on ~32 RTX 4090s for 5 days, but it also trains on a GTX 1650.
- **Pluribus** (6-player poker): under $150 of CPU. Multiplayer self-play works without equilibrium guarantees.
- **Cicero and piKL** (Diplomacy): human-like through human data plus search kept close to the human policy.
- **AlphaStar:** a league of past versions and "exploiters".
- **ByteRL:** beat a top Hearthstone player, yet was easy to exploit in LOCM.

**Lessons:**
1. Build cards from their features, and score each legal action as a pointer.
2. Search on top of the network brings most of the strength.
3. A diverse league and an exploitability test, not one fixed opponent. This answers "don't train against Forge's weak AI".
4. Human-likeness comes from human data plus anchored search.
5. Multiplayer MTG is almost unexplored.
6. Engine speed, not the GPU, is the bottleneck.

### 4.3 Forge's script language, or an abstract MTG language with adapters? ([research/representation.md](research/representation.md))
**Forge's scripts:**
- The syntax is perfectly regular: all 88,629 ability lines are `Key$ Value` lists.
- The vocabulary is large: 194 effect types used, 139 trigger modes, 81 static modes, 34 replacement events, 253 keyword heads, 1,297 parameter keys.
- **The meaning lives only in Java** (~129,500 lines of forge-game).
- 29 % of scripts carry Forge-AI hints.

**XMage** cards are Java code (32,824 classes), not data.

**Options:**
- (A) Forge scripts as the vocabulary.
- (B) Embeddings of the oracle text.
- (C) A new abstract MTG language. A second rules engine in disguise: high effort.
- (D) A hybrid. The report leans to (D):
  - each card is described by its oracle-text vector, Scryfall/MTGJSON fields, and optional Forge-script tokens, joined by `oracle_id`;
  - game state and actions use an **engine-neutral protocol**;
  - each engine has an adapter.

**What the protocol needs:**
- PettingZoo-style turn loop with per-seat views;
- new object ids on every zone change (rule 400.7);
- per-seat hidden information;
- ~25–30 decision kinds covering Forge's 113 `PlayerController` methods;
- legal actions as a scored candidate list;
- one JSONL record per decision.

The closest existing pieces: mtg-bench's PROTOCOL.md (2 players only), Spellbench, and Argentum's gym.

### 4.4 Faster simulation ([research/simulation-speed.md](research/simulation-speed.md))
**Language versus design:**
- Java to Rust alone: about 1.5–3× faster (benchmarks).
- Design changes (cheap state copies, incremental updates, no event or UI overhead): 10–1000×.

**Existing fast engines (all young, rules differ from Forge):**
- **kiln-mtg** (Rust, 4-player Commander first): 17 ms per game, 665 ns per state copy. Only 402 cards; no license.
- **arcana** (Rust, 1v1): 5.6 ms per random game; 20,590 generated cards.
- **phase.rs** (Rust, parses oracle text): 29,342 cards, 4-seat Commander runner. 38 crashes in 2,000 games.
- **Manabrew:** a Rust port of Forge that reads Forge's scripts. AGPL; "selected matchups"; its parity harness was abandoned.
- **Argentum** (Kotlin): ~10 random 1v1 games/s on 8 threads.

**Forge's rules engine:** 129,549 lines; ~63 % is the card-script interpreter. A Rust re-implementation is ~130–160k lines and 1–2+ years to reach parity (Manabrew is the yardstick).

**The owner's option 1 (barebones simulator):** 10³–10⁵× faster, but it teaches only combat and mana curve.

**Hybrids:**
- Train mostly on a fast engine, then fine-tune and evaluate on Forge. This needs a shared protocol (4.3).
- Risk: the model learns to exploit rules differences. Lockstep differential testing guards against that.

### 4.5 Cloud and free compute ([research/compute-costs.md](research/compute-costs.md))
**The owner's PC is the cheapest compute:** €1.20–1.68 a day of electricity at full load (EDF Tarif Bleu, Aug 2026).

**Free:**
- Modal: $30 of credit every month.
- Oracle Always Free: now 2 ARM cores and 12 GB.
- GCP: a one-off $300 trial.
- Kaggle: GPUs for training, slower than the RX 7800 XT.

**Not allowed by their terms:** Colab free (bans game training) and GitHub Actions (account risk for the fork).

**€2–5 a month buys about what €2 of the PC's electricity does:** ~25–45k Forge-AI games, or a few RTX 4090 hours. Cloud buys speed in bursts, not savings. The faster engine outweighs every price difference.

**The RX 7800 XT is officially supported by ROCm/PyTorch.** CachyOS is not an officially supported OS, so use Arch packages or the `rocm/pytorch` Docker image.

## 5. The option space (axes, not a plan)
| Axis | Options seen | What the evidence says |
|---|---|---|
| Training engine | Forge (Java, full rules, ~4.5 s per game without its AI); Argentum (Kotlin, MIT, gym); phase.rs or kiln (Rust); our own engine; a barebones simulator | Engine speed matters most when training with a GPU and with search. Fidelity matters for the final play in Forge |
| Model–engine boundary | Forge-specific API; an engine-neutral protocol with adapters | Neutral fits the owner's "model first". Spellbench, mtg-bench and Argentum's gym show the shape |
| Card knowledge | Forge-script tokens; oracle-text vectors from a small text encoder run once, offline; Scryfall fields; hashed card ids | Features generalise to new cards; a hybrid is the most robust |
| Learning signal | self-play league; Forge AI as an early sparring partner and yardstick; imitation of human games; search | League plus exploiters avoids a weak fixed opponent; human data anchors realism |
| Format progression | 1v1 first (more prior work and data, Arena Brawl logs, Spellbench); 4-player Commander from day one | Every prior MTG agent is 1v1; Commander multiplayer is new ground |
| Play-time strength | pure policy (fast, more "human"); policy plus search (stronger) | piKL: search anchored to a human-like policy keeps both |
| Compute | owner's PC; free credits; bursts of cheap cloud | The PC plus free tiers covers a hobby budget |

## 6. Open questions for the owner
1. Is a small text encoder, run **once offline** to turn each card's text into numbers, acceptable under "no LLM"? It never plays.
2. Must training run on Forge? Or can it run mostly on a faster engine, with Forge for the final tuning and for play?
3. Start with 1v1 (Brawl or Duel Commander), or go straight to 4-player Commander?
4. Would the group record its games (a recorder in Forge) to measure and anchor human-likeness?
5. License: a model meant for use outside Forge suggests separate model and training code under a permissive license, with a GPL adapter inside Forge. Is that the intent?
6. Where should the project live: this fork's docs for now, or its own repository later?

## 7. Measurements that would settle open points (not started)
- **Decisions per Forge 4-player game, and the engine-only time,** with a trivial policy in place of Forge's AI. This checks the ~1,500 calls and ~4.5 s used above.
- **Cost of a Forge game copy** (`GameCopier`), which decides whether search on Forge is practical.
- **GPU inference speed** on the RX 7800 XT (needs PyTorch with ROCm, which the owner would install).
- **Throughput of phase.rs and Argentum on a 4-player Commander game.**

## 8. Round 2: the owner's answers and follow-ups (2026-11-14)
**Owner's answers to section 6:**
1. A text encoder, or any LLM, is fine as a **tool** to prepare data. It must not be the playing model.
2. Forge is the end goal; training can happen anywhere. But the owner needs to **play against early versions in Forge long before the final one**: that is the only real way to judge the model. So the Forge adapter is needed early.
3. 1v1 first or Commander first: undecided. 1v1 and Commander are quite different games.
4. Recording the group's games: improbable and complex. Rely on self-play exploring many paths instead.
5. **A separate project, the owner's own**, not under Forge's licence. The part inside Forge is only the adapter.

**Follow-ups:**
- **Is ~600k games a day enough?**
  - 7 games/s is the GPU's capacity with a small model. With Forge's engine the cap is ~1.8 games/s (~150k/day), so 600k/day needs a faster engine.
  - Reference points (games to reach a level):
    - jackmaiorino, 1v1 Pauper, fixed decks: ~50k games to reach XMage's heuristic AI;
    - KataGo: 4.2M games to beat ELF OpenGo;
    - AlphaZero chess: ~20M games to superhuman and ~44M to beat Stockfish 8 (secondary sources quoting the paper's Methods);
    - ygo-agent: 100M+ games.
  - At 600k/day, those are ~2 hours, ~7 days, ~1–2.5 months and ~6 months.
  - The number for Commander is unknown. A learning curve shows within days whether a model is learning.
  - Ways to need fewer games:
    - a fixed deck pool first (the owner's 19 decks);
    - imitation of Forge's AI to skip the random-play phase;
    - card features that transfer;
    - a curriculum.
  - Search-based training spends many simulated continuations per decision, so its games per day are lower.
- **"Paper games" in the Playgroup.gg corpus** are games played in person with physical cards, which players log in an app afterwards: who played, commanders, winner, how it ended, life and damage by turn, mulligans. **Not the moves.** Their online table (Playgroup Live) records casts and zone moves, but not the choices that were available. So it is not a move-by-move corpus.
- **One model for several formats** (the owner's extrapolation) is how Maia-2 replaced 9 per-level models with one model plus a skill input. The format (player count, life, commander rules) becomes an input. Mixing formats risks "negative transfer" if one format dominates the training mix; weighting the mix and fine-tuning on Commander manage it. With the format as an input, 1v1 games teach format-specific habits as such, not as Commander habits.
- **Human-likeness with little human data** (no recording infrastructure):
  1. **Search anchored to a human-like policy (piKL).** In chess and Go it predicted human moves better than imitation alone, while winning over 85 % against the imitation model. It still needs some human-like base policy.
  2. **Preference feedback.** A person marks which of two moves looks more natural, or flags a weird move during a test game. Christiano et al. 2017 taught behaviours with 15 minutes to 5 hours of a non-expert's feedback. For us: a "this move felt wrong" flag while the owner plays test versions.
  3. **Transfer from abundant 1v1 human data** (17lands, MTGO logs), with the format as an input, for generic habits: mulligans, attacks, sequencing.
  4. **Human limits by design:** limited lookahead, imperfect memory, calibrated noise. Cheap but crude: Maia found that weakened engines do not play like humans.
- **Self-play exploring many paths** (answer 4) is exactly reinforcement learning by self-play. Randomness makes the model try alternatives, and results reinforce the good ones; a league of past versions avoids going in circles. It gives strength, not human style. Style comes from the signals above.
- **The Rust rewrite with AI agents.** The owner doubts "1–2 years". Translating 130k lines is fast with agents. The slow parts are:
  - Java's shared mutable object graph does not map line by line onto Rust's ownership model, so it becomes a redesign;
  - proving the same behaviour needs differential testing against Forge;
  - fast copies need a new state layout (the actual goal);
  - Forge changes daily.

  Manabrew (a Rust port reading Forge's scripts) is at "selected matchups" after 6 months and ~1,400 commits. Revised view: **months for a scoped engine** (e.g. the ~1,100 cards of the owner's decks); full parity with Forge is the long tail.
- **Licence consequences of answer 5** (not legal advice):
  - The model, the training code and the protocol can be the owner's own, under any licence, in their own repository.
  - The Forge adapter lives in Forge under GPL-3, which upstream needs anyway.
  - A Rust **port of Forge** is a derivative of GPL code, so it would be GPL too (Manabrew is AGPL). It cannot be the owner's own.
  - A **clean-room** engine, written from the Comprehensive Rules and not from Forge's code, can be the owner's. It can still be checked against Forge by playing the same situations through the protocol (comparing behaviour, not copying code).
  - Card knowledge: Forge's scripts are part of its GPL repository. An own-licence model should learn cards from Scryfall/MTGJSON data plus the text encoder. Forge-specific features can come from the adapter at run time. Card texts belong to Wizards of the Coast (Fan Content Policy: free, non-commercial).

**Open points after round 2:**
- **Training engine:**
  - Forge via the adapter (simple, slow, available now);
  - a clean-room engine of the owner's (fast, own licence, months);
  - an existing MIT engine (Argentum: Kotlin, 2–6 players, gym API).
- **Early play in Forge before upstream accepts anything** means a local Forge build with the adapter, like the one built on 2026-11-14. To confirm that this is acceptable for testing.
- 1v1 or Commander first; the format mix.

## 9. Round 3: measured inference speed; clean-room engine vs Forge port (2026-11-14)
**Owner:** a local Forge build with the adapter is fine for testing early versions; the official build only at the end. PyTorch for ROCm and OpenBLAS are installed (`sudo pacman -S --needed blas-openblas python-pytorch-opt-rocm`, ~26 GiB).

### Inference speed, measured
PyTorch 2.15.0 on HIP 7.2 sees the RX 7800 XT (gfx1101). numpy with OpenBLAS: ~480 GFLOPS on the CPU (was 7 with the reference BLAS).

Setup: `measure/torch_infer_bench.py`, transformer encoder, 128 tokens (one per visible object).

| Model | CPU, 1 core, per decision | GPU, one decision at a time | GPU, batched, bfloat16 (throughput) | GPU time per game (1,500 calls) | Games/s the GPU can serve |
|---|---|---|---|---|---|
| tiny, 0.4M | 1.4 ms | 0.4 ms | 79,000 decisions/s | 0.02 s | ~53 |
| small, 3.2M | 9.3 ms | 1.0 ms | 19,000 decisions/s | 0.08 s | ~13 |
| medium, 19M | 45 ms | 1.5 ms | 4,400 decisions/s | 0.34 s | ~2.9 |
| large, 85M | 191 ms | 2.9 ms | 1,200 decisions/s | 1.2 s | ~0.8 |

Readings:
- **Playing against a human:** under 3 ms per decision on the GPU, under 50 ms on one CPU core up to the medium size. The AI's thinking will be invisible.
- **Training:** with Forge's engine (~1.8 games/s on 8 cores, estimate), the engine is the bottleneck up to the medium model. The GPU becomes the limit only around the large one. A 10–100× faster engine moves the limit to the GPU for every size above tiny.
- Effective GPU speed is ~22 TFLOPS in bfloat16, so section 3's estimate (10–20) was slightly pessimistic.
- CPU runs with 8 threads were slower than with 1 (thread over-subscription), so per-core numbers are the useful ones: one game per core.

### How much Forge hard-codes (measured)
- **The engine:** a few dozen card-name checks in forge-game Java, e.g. damage doublers like "Gratuitous Violence" and "Pyromancer's Swath" in the damage code.
- **The AI:** about 70 checks in forge-ai, 46 per-card classes in `SpecialCardAi`, and `AILogic$` in 1,814 scripts.
- **Scripts: 3,692 scripts carry "Remember/Imprint" plumbing.** The script author manages state by hand: what was exiled, what to return, when to forget. The bugs fixed upstream today (Fiend Hunter and 10 similar cards, upstream PR 12875) were exactly that plumbing.

### Clean-room engine vs a port of Forge
| | Port of Forge (e.g. to Rust) | Clean-room engine (own design, from the Comprehensive Rules) |
|---|---|---|
| **Licence** | GPL (derived from Forge's code); not the owner's | The owner's |
| **Starting point** | 130k lines of working Java plus 34k card scripts: a complete, running specification | The Comprehensive Rules and card texts. Forge is only a behaviour reference, through the adapter |
| **First playable subset** | Fast: translate the core and the needed effects, reuse the scripts | Weeks to a few months: core rules plus card definitions for a chosen pool |
| **Broad card coverage** | Comes with the interpreter. The tail is ~200 effect types × ~1,300 parameter keys | The main cost: every card needs a definition (own card language, or an oracle-text parser, plus per-card code for the truly unique cards). An LLM tool can draft definitions; tests decide |
| **Fidelity to Forge** | High by construction, if tested against Forge | Different; measured by playing the same situations in both engines |
| **Speed** | A literal port gains ~1.5–3×. More needs a new state layout, which removes the port's advantage | Designed for cheap copies from day one |
| **Hard-coding** | Inherits Forge's: script plumbing, name checks, quirks | The owner's choices. Unique cards still need specific code, but it lives in each card's definition, not in the core |
| **Upkeep** | Chase Forge's daily changes, or freeze and drift | New sets: write or generate definitions, then test |
| **2026 evidence** (project claims, unverified) | Manabrew (Rust port of Forge): 6 months, ~1,400 commits, "selected matchups", parity harness abandoned | phase.rs: ~8 months, ~8.7k commits, 29k cards claimed, 1.9 % crashes in 4-player games. Argentum: ~10 months, ~17k commits, 21.7k cards claimed. kiln: 402 verified cards |

**Reading:**
- In 2026, AI-assisted clean-room engines progress at least as fast as the one Forge port. The port drags Forge's architecture along, and that architecture is what makes it slow.
- For the owner's goals (own licence, speed, no hand-managed plumbing), clean-room fits better.
- Its risk is rules correctness on the long tail, in any engine. Two levers:
  - **scope:** start with the cards actually played (the owner's 19 decks, ~1,100 cards);
  - **differential testing:** Forge as the referee, through the adapter.
- Effort estimates (agent work, uncertain):
  - a solid core: about 1–3 months (turns, priority, stack, zones, mana, costs, combat, state-based actions, triggers, replacement effects, layers, commander rules);
  - definitions for ~1,100 cards: about 1–2 months;
  - broad coverage: further months, mostly verification.
