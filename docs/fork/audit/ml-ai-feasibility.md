# Feasibility: a machine-learned AI player for Forge (2026-11-14)

**Question (owner, 2026-11-14):** Forge's AI is a large set of hand-written rules. It breaks often and is a poor "fake player". How feasible is a real machine-learning model, trained by us, that plays the game closer to a human? Later: several difficulty levels and personalities.

**Context:** the rule-based AI and its simulation mode are audited in [ai.md](ai.md) (2026-10-15). This document covers only the machine-learning routes. Measurements were taken on upstream `master` plus the fork (`develop` `3a8911f3cfd`).

## Short answer
- **A model trained from scratch by self-play (the AlphaZero way): not feasible for us** in Commander with ~1,100 different cards. The best public attempt on a Magic engine reaches ~50 % against the heuristic AI in 1v1 with 4–5 fixed Pauper decks, after months of work (results from June 2025 to February 2026) and a university cluster. It would also not play like a human.
- **A model trained on human games (the Maia way, which is what "human-like" requires): not feasible.** No corpus of Commander games exists. Our own games would give thousands of decisions; this needs millions.
- **Feasible now: a language model (LLM) takes an AI seat.** Forge lists the legal choices; the LLM picks one and can explain why. LLMs already understand card text, so new cards need no training. Personalities and difficulty are a prompt and a model choice. Costs: money per game, waiting time, and a network dependency. Its playing strength in 4-player Commander is unmeasured; a small spike would measure it.
- **"Our own trained model" stays possible as a second stage:** record the LLM's games, then fine-tune a small open model on them so it runs on the owner's GPU, free and offline (distillation). That is a research project with an uncertain quality loss; start it only if stage 1 plays well.

## 1. What any learned player must handle
- **Many kinds of decisions.** `PlayerController` has 113 abstract methods (counted 2026-11-14): play a spell, targets, attackers, blockers, damage order, mulligan, scry, modes, X values, cost choices, votes, dice. A learned policy needs an answer for each, or a fallback to the rule AI.
- **Many cards, and new ones each set.** The owner's 19 Commander decks hold 1,136 distinct non-basic cards ([card-rules audit](card-rules-2026-11-14/README.md)); Forge has ~34,000 card scripts. A model that learns from card IDs knows only the cards it trained on. A model that reads card text generalises better: on *draft picks* (a much simpler task), a 2024 study predicted ~55 % of human picks on cards it had never seen (Bertram et al.).
- **Four players, not two.** Most game-AI theory and self-play methods (AlphaZero, poker bots, Hearthstone agents) are for two-player zero-sum games. With four players there is no single "best" strategy; who to attack and when to help the leader are political choices.
- **Hidden information and chance.** Hands, library order, shuffles.
- **Long games with a late reward.** AI-only Commander games measured here last ~22 turns (section 2); the game played for the UI memo lasted ~26. Each player makes dozens of decisions, and the only clear reward is the final result.

## 2. Path A: train our own model by self-play (reinforcement learning)
**How it works.** The model plays millions of games against copies of itself. It is rewarded for wins and slowly learns which choices lead to wins.

**What it needs here:**
- **A step-by-step game API** ("observe the state, list the legal actions, act"). Forge has none. Upstream PR 11627 (a headless module, open since 2026-08-15, marked stale on 2026-10-20) is the closest; an RL researcher on that PR asks for exactly this API. The fork's web seat bridge already plays a whole game through prompts and legal choices (`ScriptedSeat`, see section 4), so this part is the least risky.
- **A state encoder and a network.** A transformer over the cards on the table, with card text turned into vectors.
- **Many games.** See the measured throughput below.

**Measured throughput (2026-11-14):** 8 headless games, 4-player Commander, Forge AI in every seat, the owner's Kaalia, Norn, Teysa and Zhulodok decks, seed 42 (`forge sim -f Commander … -n 8 -c 600 -s 42`, one JVM, isolated profile).
- 35.7 s per game on average (17 to 107 s; median ~28 s), 291 s for all 8 including start-up.
- 22 turns per game on average (16 to 29), so about 5–6 turns per player. Per game: ~46 spells cast, ~16 abilities activated, ~75 triggers, ~15 creatures sent to attack.
- One JVM used ~1.4 CPU cores and 1.2 GB of memory. So the owner's 8-core PC could run perhaps 8 games at once: ~700 games per hour, ~17,000 per day (parallel scaling not measured).
- A learning agent is slower: every decision also runs the network.
- Winners: Zhulodok 4, Kaalia 3, Teysa 1, Norn 0.

For scale: the XMage project below needed ~50,000 games to reach parity with its heuristic AI in a much simpler setting. Commander would need many times more, so weeks to months of non-stop running per experiment, and RL needs many experiments.

**Prior work, the closest match:** an XMage fork with a self-play agent (jackmaiorino/mage, one author). Transformer policy, PPO, self-play with a curriculum, population-based training.
- Scope: 1v1, 4–5 fixed Pauper decks.
- Compute: one RTX 4070 Super locally (~3 games/s), then a university cluster (a GPU node plus 640 parallel game runners on 10 CPU nodes).
- Results against XMage's heuristic AI: ~29 % (June 2025), ~44 % (July 2025), ~50 % after 50,000 games (January–February 2026). No results against humans. The author reports learning plateaus on combo decks.

**Verdict:** not feasible for us. Commander multiplies every difficulty of that project: 4 players, 100-card singleton decks (~1,100 distinct cards across the owner's decks, against a few dozen per Pauper deck), much longer games. The owner's hardware (Ryzen 7 5800X3D 8 cores/16 threads, 32 GB RAM, Radeon RX 7800 XT 16 GB with ROCm) can run small experiments, not this. Even a success would play *strong but alien*: self-play learns to win, not to play like a person.

## 3. Path B: learn from human games (the Maia way)
**How it works.** Maia (chess, University of Toronto, Cornell and Microsoft Research) trains a network to predict the move a human of a given rating would make, from Lichess's public database of human games. It matches human moves more often than strong engines do, and one model per rating band gives natural difficulty levels. Maia-2 uses one model with a skill input. This is the proven route to "plays like a human, at a chosen level".

**What it needs here:** a very large corpus of human Commander games, decision by decision. None exists. 17lands publishes MTG Arena replay data, but only for 1v1 Limited (draft) events. Recording the owner's group in Forge would give perhaps tens of games per month.

**Verdict:** not feasible as the main route. Our own recorded games are still useful: they can test whether an AI chooses what the owner's friends would choose.

## 4. Path C: a language model takes an AI seat
**How it works.** At each decision, Forge sends the LLM what that player can see (board, hand, life totals, recent events, card texts) and the list of legal choices. The LLM returns one choice. Rules mistakes are impossible because only legal choices are offered; the risk is strategic mistakes.

**Prior work (all 1v1, on Forge):**
- *spike-eval* (lumlaolao/spike-eval): a model takes a Forge seat against a person, Forge's AI or another model. Every decision lists the legal actions; answers are tool calls. With its default cheap model, a game against a person cost about $0.09 on average. Games against Forge's AI took about 18 minutes on average (5 to 90). A recorded game shows Claude Haiku winning against Forge's AI. Its puzzle test: 20 models, 58 of 100 hard puzzles solved.
- *mtg-bench* (zachmay/mtg-bench): draft and play through a TCP bridge inside Forge; any decision Forge's AI makes for an agent is counted as "delegated". No published results.
- No published 4-player Commander results were found.

**How it fits Forge.** Two places to plug it in:
1. **A new AI controller** that extends `PlayerControllerAi` (built by `LobbyPlayerAi.createControllerFor`). It overrides the decisions that matter (`chooseSpellAbilityToPlay`, `declareAttackers`, `declareBlockers`, `chooseTargetsFor`, `mulliganKeepHand`, a few others) and leaves the rest (mana payment, trigger order, minor choices) to the rule AI. It works in the desktop app and in `sim`, so it can be benchmarked over many games. It must build its own view of the game and filter out what the seat cannot see: the AI controller can read everything.
2. **The fork's web seat bridge.** It already sends each prompt with labels and legal options, takes back an index, and filters hidden information per viewer. `ScriptedSeat` (639 lines, `fork-web/src/test/.../seat/`) already plays whole 4-player games through it. An LLM seat would replace its fixed policy with an LLM call. This covers every decision a human meets, but it only runs in the fork's app.

**Cost per game (estimate, not measured).** Assumptions:
- 50–200 LLM calls per AI seat per game. Basis: in the measured games each player had ~5–6 turns and cast ~12 spells, plus targets, attacks, blocks and responses on the other players' turns.
- ~10,000 input tokens per call (a 4-player board with card texts).
- 500–2,000 output tokens per call, thinking included.
- Prices on 2026-11-03, per million tokens, input/output: Haiku 5.5 $0.10/$0.50, Sonnet 5.5 $2/$10, Opus 5.5 $4/$20.

| Model | Per AI seat per game | Game with 3 LLM opponents |
|---|---|---|
| Claude Haiku 5.5 | ~$0.05–0.40 | ~$0.20–1.20 |
| Claude Sonnet 5.5 | ~$1–8 | ~$4–24 |
| Claude Opus 5.5 | ~$2.50–16 | ~$8–48 |

Mixing helps: a cheap model for routine decisions and a stronger one for attacks, blocks and big spells. Calling the LLM only when it has a real choice (not for every empty-stack priority pass) cuts the call count. The fork's UI measurement shows how many stops a seat meets with Forge's default stops: 11 per quiet round, 61 over turns 15–25 ([ui-direction-memo.md](../design/ui-direction-memo.md), U1).

**Waiting time.** At 2–10 s per call, 50–200 calls is 2–30 minutes of AI thinking per seat per game. Three LLM opponents can double the length of a game unless routine decisions stay with the rule AI.

**Local models instead of an API.** The RX 7800 XT (16 GB) can run open models of roughly 7–14 billion parameters (quantised). They are free and offline, but much weaker at reading complex boards than API models, and slower per call. Worth a test, not a plan.

**Verdict:** feasible. A first version is weeks of work, not months. Unknown: does it play 4-player Commander better or more naturally than Forge's AI? Only a measured spike answers that.

## 5. Path D: our own small model, trained on the LLM's games (stage 2)
**How it works.** Record every decision of Path C games (state, legal choices, choice, reason). Fine-tune a small open model on those records (LoRA fine-tuning), then run it locally. UrzaGPT (2025) LoRA-tuned open LLMs for MTG card selection (drafting). Optionally improve it further with self-play (Path A methods), starting from a model that already plays reasonably.

**Needs:** thousands of recorded games (API cost from the Path C table), a training setup on ROCm or rented GPUs, and an evaluation harness (`sim`).

**Verdict:** plausible but a research project (months, uncertain quality loss). Decide only after Path C shows good play.

## 6. Difficulty levels and personalities
| | Self-play model (A) | Human-data model (B) | LLM seat (C) | Distilled model (D) |
|---|---|---|---|---|
| Difficulty | Older, weaker checkpoints; they play oddly, not like weaker humans | Natural: one model or input per skill level (Maia) | Model tier and effort level; how much help it gets (e.g. Forge's simulation preview). Asking a strong model to "play like a beginner" is unreliable | Model size; checkpoints |
| Personality | One training run per personality (reward shaping, e.g. a bonus for attacking) | Train on one player's games | A paragraph in the prompt: aggressive, cautious, vengeful, "politician". Could also write table talk in the game log | Inherited from the Path C prompts it learned from |
| Cost of a new one | A full training run | Data for that style | Minutes | Re-train or fine-tune |

Forge's own six AI profiles (`forge-gui/res/ai/*.ai`: Cautious, Default, Experimental, Hard, Hardest, Reckless) stay available and can mix with any path: e.g. the rule AI for routine choices, tuned per profile.

## 7. Recommendation
1. Do not start Path A or B.
2. If the owner wants to try, run a **Path C spike** (about 1–2 weeks of agent work): an LLM controller that extends `PlayerControllerAi`, owns only the major decisions, sees only what its seat can see, and logs every call (tokens, time, choice, reason). Measure in `sim` and in a few real games: win rate against Forge's AI over many 4-player games, calls per game, cost per game, time per game, and the owner's judgement ("does it feel like a player?").
3. Decide on personalities, difficulty and Path D from those numbers.

**Open questions for the owner:**
- Is "trained by us" a requirement, or is the goal "plays well and like a human", whatever the technique?
- What cost per game is acceptable, if any? Is an online API acceptable, or must it work offline?
- Fork-only or upstream? An LLM AI needs an API key and the network. Upstream would probably not take it in the core; in the fork it means playing a fork build again.

## Sources
- Forge code at `develop` `3a8911f3cfd`: `PlayerController.java` (113 abstract methods), `PlayerControllerAi.java`, `LobbyPlayerAi.java:37`, `forge-ai` (60,847 lines of Java), `fork-web/src/test/java/forge/fork/web/seat/ScriptedSeat.java`.
- Upstream PR 11627, "Add headless simulation and terminal gameplay" (read 2026-11-14).
- XMage RL agent: https://github.com/jackmaiorino/mage (README read 2026-11-14).
- spike-eval: https://github.com/lumlaolao/spike-eval; mtg-bench: https://github.com/zachmay/mtg-bench (READMEs read 2026-11-14).
- Bertram, Fürnkranz, Müller, "Learning With Generalised Card Representations for Magic: The Gathering", IEEE CoG 2024: https://arxiv.org/abs/2407.05879
- UrzaGPT: https://arxiv.org/abs/2508.08382
- Maia: https://maiachess.com/blog/introducing_maia and https://github.com/CSSLab/maia-chess
- Hearthstone and card-game RL: https://arxiv.org/abs/2303.05197 (Hearthstone, deep RL without search), https://arxiv.org/abs/2404.16689 (exploitability of a Legends of Code and Magic champion agent).
- 17lands replay data (1v1 Limited only): https://joelnitta.github.io/mtgr/articles/arrow.html
- Claude prices: Claude API skill model table, cached 2026-11-03.
