# Prior MTG and card-game AIs (research report, 2026-11-14)

> Archived research-agent report for the MTG model brainstorm ([README](../README.md)). Verbatim except the title; claims are as of 2026-11-14 and each cites its source. Not a decision.

I found about 30 relevant projects. For a Forge Commander AI, the most useful are recent hobby and open-source MTG projects: MageZero, jackmaiorino's newer mtg-kernel and Spellbench, the Argentum gym, and a Forge HTTP bridge. The older academic and commercial MTG AIs teach lessons but offer little code. No public MTG AI handles 4-player Commander. All pages were read on 2026-11-14 unless marked otherwise.

## 1. Survey table

| Project | Game | Method | Reusable assets and license | Compute | Results |
|---|---|---|---|---|---|
| **XMage AI** | MTG | "mad" bot (ComputerPlayer7): alpha-beta minimax over simulated games, depth max(4, skill), at most 5,000 nodes, skill×3 s per decision. "monte carlo" bot (ComputerPlayerMCTS): UCT search that reshuffles libraries and redeals opponents' hands to hide information | MIT | CPU, seconds | On Spellbench, mad is +248 Elo above random; MCTS with 8 iterations is +33 |
| **Forge Flat Monte Carlo** (upstream PR 12308, 2026-10-24) | MTG | Takes the heuristic AI's top plays and samples each one with hidden cards redealt (`HiddenInfoShuffler`), plays out to main phase 2, then scores the board (`GameStateEvaluator`) | Already in the tree (GPL-3) | Time-budgeted CPU | No numbers published |
| **Magarena** | MTG 1v1 | Minimax alpha-beta, UCT search, flat Monte Carlo ("Vegas"), MTD(f). "Cheat" variants see hidden cards | GPL-3, Java. Dormant: last release 1.96 (Dec 2019), last commit Apr 2023 | CPU | None (the source comment still reads "score = XX%") |
| **Wagic** | MTG | Hand-tuned per-action "efficiency" scores | BSD-style, C++, still active | Trivial | — |
| **Duels of the Planeswalkers / Shandalar / MTG Arena** | MTG | DotP: a lookahead tree about 3 moves deep with helper threads and no combo reasoning (*from Wikipedia citing Buckland 2009; I could not open the original*). Shandalar: nothing public. Arena: algorithm unpublished; a reverse-engineering blog says the bot runs on the client (`HeadlessClient`) | Closed source | — | Unverified |
| **Ward & Cowling 2009; Cowling, Ward & Powley 2012** | Simplified MTG: lands and vanilla creatures only, 1v1 | MCTS over about 40 sampled deals × 250 simulations, subset choices split into yes/no steps, pruning of dominated moves | Paper only | Under 1 CPU-second per move | Slightly better than an expert rule bot, which itself won 46.6% against 7 humans |
| **Churchill, Biderman & Herrick 2019** | MTG | Proof: optimal play is at least as hard as the Halting Problem | — | — | No exact solver can exist |
| **MageZero** | MTG through an XMage fork, one deck at a time, 1v1 | AlphaZero-style tree search plus a graph neural network over typed game entities. Card vocabulary is hashed and open, so new cards need no retraining. One policy head per decision type | MIT. v0.3.0-alpha with an `mz` CLI and a 16-deck opponent pool | About 800 games/hour on 16 CPU threads | Its deck rose from 16% to 66% against minimax bots. Averages 47.9% against bots that a human is estimated to beat 61% of the time |
| **jackmaiorino/mage** | Pauper 1v1 on XMage | PPO self-play with a transformer. Opponents step up from a weak bot to XMage's heuristic AI to self-play; population-based training. Inference through ONNX Runtime inside the JVM | MIT | RTX 4070 Super at about 3 episodes/s; cluster of 640 runners | About 50% against ComputerPlayer7 after 50k episodes (confirms your notes) |
| **mtg-kernel + Spellbench** (same author) | Pauper 1v1, Rust engine | Self-play RL policy/value networks | MIT. Archon 2 weights on Hugging Face (1.23M parameters). Spellbench is an engine-neutral bot protocol with Elo boards | — | Best bot, Basilisk 1 (private), is +475 Elo above random; an LLM bot (GPT-6 Luna) is +234 |
| **Argentum Engine** | MTG in Kotlin, multiplayer pods | Alpha-beta engine AI. Gym API (reset/step/legal actions, instant state copies, hidden information masked). An AlphaZero-style search interface that calls a neural network server | MIT (2026) | — | — |
| **"The Argentum way"** (gab-25/mtg_gauntlet PRs 84/85) | Forge, Duel Commander | Drives Jev the way Argentum does: whole masked state as text, decklist, decisions so far, options under opaque keys. **Jev** is TypeSafe's hosted "System One decision model" on OpenRouter, billed per input token (cloud only). Falls back to Forge's AI | GPL-3. Its bridge, gab-25/mtg_forge_engine, runs Forge over HTTP with 2–4-seat Commander | Cloud | Jev wins 35–42% where Forge's AI wins 60% in the same seat (40 games) |
| **Toy MTG environments**: managym/manabot, open-gathering, MTG-Causal-RL (arXiv 2605.06066) | Basic lands and vanilla creatures / nothing yet / 56 cards | PPO; MTG-Causal-RL uses a fixed 478-action space | managym and manabot archived; open-gathering is scaffolding; MTG-Causal-RL code on an anonymous mirror, license not stated | — | Per-deck PPO win rates of 21–68% |
| **Drafting models**: 17lands data, DraftFM, Bertram et al., ANA | MTG Limited | Supervised learning on human picks | DraftFM weights on Hugging Face. 17lands data is CC BY 4.0 according to the ANA card. ANA is CC BY-NC-SA | ANA: 4.5 ms per pick on CPU | DraftFM: 51–60% top-1 on unseen sets. Bertram: 55% on unseen cards. ANA (its own claim): matches the human's play 62.5% of the time, against 39.3% for Forge's AI |
| **Upstream PR 11627 authors** | — | rrnewton has no public MTG AI repository; his Forge fork has headless-bridge and state-comparison branches (Aug–Sep 2026). AlexMatthers has no MTG repository | — | — | — |
| **ygo-agent** | Yu-Gi-Oh! on ygopro-core | PPO-family training with LSTM in JAX. Card text is turned into LLM embeddings | MIT. Checkpoints and embeddings published; humans can play it through the Neos web client | Over 100M games ≈ 32 RTX 4090s for 5 days. Trains on a GTX 1650 | 98% against random within minutes. About 13.5k card codes, 33 tested decks. No published results against humans |
| **ByteDance Hearthstone line** (2303.05197, 2404.16689) | Hearthstone, 350+ cards; LOCM | End-to-end policy trained by fictitious play against a pool of past versions. Actions chosen as (type, target) | None | 24 V100s + 5,856 CPU cores, up to 23 days | Won 4/4 best-of-5 matches against a top-10 China streamer, yet ByteRL is "highly exploitable" in LOCM |
| **Cardsformer, SabberStone** | Hearthstone | Card text used to predict state changes, so the policy handles unseen cards | Cardsformer code has no license; SabberStone is AGPL and its main repo now returns 404 (forks remain) | — | — |
| **LOCM, gym-locm, Rubin 2026** (2609.06816) | Legends of Code and Magic | 5 years of competitions (last in 2022). Imitation learning plus search over sampled worlds | MIT | — | 51.35% against ByteRL over 10k games. Search adds 24.6 points and resists exploitation better |
| **Pokémon TCG Kaggle challenge (June 2026), pkm-cabt-ppo** | Pokémon TCG, about 2,000 cards | PPO self-play, pointer network, search distilled into the network | One set of weights per deck; license not stated | — | Tested only against a random player |
| **Lorcana** | — | Hobby Python simulator | No license | — | Nothing usable |
| **Pluribus** | 6-player poker | Monte Carlo CFR blueprint plus limited-depth search | — | 8 days on a 64-core server, under 512 GB RAM, no GPU, **under $150**. Plays on 2 CPUs | Beat professionals (about 5 big blinds per 100 hands) |
| **Cicero; piKL; Maia/Maia-2** | Diplomacy; chess, Go | Human-data models, plus search kept close to the imitation policy (KL regularization); skill-conditioned imitation | — | — | Cicero placed in the top 10% of humans. piKL is stronger than imitation alone with the same human-likeness |
| **AlphaStar** | StarCraft II | Supervised start on 971k human replays, then a league: 3 main agents, 3 main exploiters, 6 league exploiters, opponents chosen by how hard they are to beat | — | Each agent: 32 TPUs for 44 days | Grandmaster, top 0.2% |

## 2. Top 6 lessons for the design

1. **Encode cards by their features, and score legal actions one by one.** MageZero, ygo-agent, Cardsformer, DraftFM and Bertram all build card identity from attributes or text, which carries over to unseen cards. Commander's roughly 30k cards need this. jackmaiorino trained better with hashed card IDs than with text embeddings on a small fixed pool. So the best mix is probably both: text and attribute features plus a learned per-card correction. Score each legal action as a pointer, as MageZero, Archon and the Hearthstone agents do. A fixed action table (MTG-Causal-RL) only works at 56 cards.
2. **Search on top of the network is what makes it strong.** Sampling the hidden cards is cheap and good enough: Cowling et al., LOCM (+24.6 points), MageZero. Cowling also found that slightly random rollout players beat deterministic expert ones. Forge's new Flat Monte Carlo already provides sampled deals and rollouts; a value network can replace `GameStateEvaluator`.
3. **Opponent diversity needs a league and an exploitability check.** Use AlphaStar's exploiters and past-version pools, jackmaiorino's curriculum and population training, and MageZero's 16-deck pool. ByteRL beat a top human but was easy to exploit, so test our model with a trained exploiter, not only win rate against Forge's AI.
4. **Human-likeness comes from human data plus KL-anchored search** (Maia, piKL, Cicero, AlphaStar's supervised start). Pure RL drifts into odd play: MageZero's Cecil example. 17lands only covers Arena Limited. No public Commander decision logs exist, so log every decision our friends make in the fork's web UI. A Maia-2-style skill input could later drive the difficulty levels.
5. **Multiplayer has almost no MTG prior work.** Pluribus shows self-play plus limited search works with more than two players and no equilibrium guarantee, at CPU-only cost. Cicero shows human anchoring matters most when players cooperate, which fits Commander politics. Model players relative to the AI's own seat (MageZero's player node was built to extend to multiplayer) and reward finishing place.
6. **Engine speed is the bottleneck, not the GPU.** XMage-based projects get 800 games/hour or 3 episodes/s and cap at about 6 parallel games because XMage uses so much memory; Forge will be similar. Start with one deck or archetype and bootstrap by imitation before RL. Inference is cheap enough (ANA 4.5 ms on CPU; ONNX inside the JVM). Turing-completeness means time budgets and a fallback to Forge's AI are required, as Argentum and mtg_gauntlet do.

## 3. Concrete candidates

**To start from**
- **MageZero (MIT):** the entity-graph encoder, the tree search and the per-decision-type heads. Port the `StateEncoder` idea to Forge.
- **Argentum `gym` and `gym-trainer` (MIT):** a JVM-side search loop with a Python network server. Our adapter has the same shape, so this is a design reference.
- **jackmaiorino/mage (MIT):** the PPO and curriculum stack, and ONNX Runtime inference inside the JVM.
- **ygo-agent (MIT):** the vectorized C++ environment and the LLM-embedding approach to cards.
- **gab-25/mtg_forge_engine (GPL-3):** a 2–4-seat Forge decision API to compare with our fork-web bridge.
- **Forge's `FlatMonteCarloPicker`:** the place to plug a value network in.

**To benchmark against**
- Forge's AI profiles (Default/Hard/Hardest/Reckless/Cautious/Experimental) plus Flat Monte Carlo.
- Spellbench: write a Forge engine adapter for its protocol to play XMage mad, gorge and the Archon bots. Its boards are 1v1 Pauper/FDN only.
- XMage mad.
- How often the model matches the human's move on held-out logs (ANA-style).
- A trained exploiter.

**Skip**
- managym/manabot, open-gathering, MTG-Causal-RL: too small.
- Magarena: dormant, but readable as an MCTS reference.
- Wagic, DotP, Shandalar, Arena: rule-based or closed.
- Jev: cloud-only and billed per call, against the zero-running-cost goal.
- Lorcana: nothing usable.

**Could not verify:** the DotP and Shandalar internals, Arena's bot algorithm, the column schema of 17lands replay data (the site renders in JavaScript), the MTG-Causal-RL engine and compute, ByteRL's architecture, Cicero's code license, and the exact meaning of ygo-agent's card-list flag.

## Sources (read 2026-11-14)
- XMage: github.com/magefree/mage, files `Mage.Server.Plugins/Mage.Player.AI.MAD/src/mage/player/ai/ComputerPlayer6.java`, `ComputerPlayer7.java`, `Mage.Player.AIMCTS/.../ComputerPlayerMCTS.java`, `MCTSNode.java`, `Mage.Server/config/config.xml`
- Forge: local `forge-ai/src/main/java/forge/ai/simulation/FlatMonteCarloPicker.java` (upstream PR 12308); upstream PR 11627 read via `gh`
- Magarena: github.com/magarena/magarena (`src/magic/ai/MagicAIImpl.java`, `MCTSAI.java`)
- Wagic: github.com/WagicProject/wagic (`projects/mtg/src/AIPlayerBaka.cpp`, LICENSE)
- DotP: https://en.wikipedia.org/wiki/Magic:_The_Gathering_%E2%80%93_Duels_of_the_Planeswalkers ; https://library-of-leng.com/articles/wizards-magic-en-articles-archive-duels-p-200e6583 (stub only)
- Arena: https://www.mayer.cool/writings/I-Hacked-Magic-the-Gathering (undated)
- Cowling, Ward, Powley 2012: https://eprints.whiterose.ac.uk/75050/1/EnsDetMagic.pdf ; Ward & Cowling 2009: https://dblp.org/rec/conf/cig/WardC09.html
- https://arxiv.org/abs/1904.09828
- https://github.com/WillWroble/MageZero
- https://github.com/jackmaiorino/mage ; https://github.com/jackmaiorino/mtg-kernel ; https://github.com/jackmaiorino/spellbench ; https://jackmaiorino.github.io/spellbench/ ; https://huggingface.co/mtg-kernel/archon-2-pauper
- https://github.com/wingedsheep/argentum-engine ; https://openrouter.ai/docs/guides/community/jev-tutorial
- gab-25/mtg_gauntlet PRs 83–85 and README; https://github.com/gab-25/mtg_forge_engine
- https://github.com/jacklionheart/managym ; https://github.com/jacklionheart/manabot ; https://github.com/nymann/open-gathering
- https://arxiv.org/abs/2605.06066 (and html v1)
- https://arxiv.org/abs/2608.19568 ; https://arxiv.org/abs/2407.05879 ; https://huggingface.co/alakazamworld/ana-mtg
- github.com/rrnewton (repositories and forge branches); github.com/AlexMatthers
- https://github.com/sbl1996/ygo-agent (README, LICENSE, releases, `scripts/code_list.txt`)
- https://arxiv.org/abs/2303.05197 (html v2) ; https://arxiv.org/abs/2404.16689 ; https://github.com/WannianXia/Cardsformer ; https://hearthstoneai.github.io/
- https://github.com/ronaldosvieira/gym-locm ; https://arxiv.org/abs/2305.11814 ; https://arxiv.org/abs/2609.06816
- https://huggingface.co/TomatoCream/pkm-cabt-ppo ; https://ptcg-abc.pokemon.co.jp/?lang=en (via search summary); https://github.com/ngroover/lorcana
- https://ai.meta.com/blog/pluribus-first-ai-to-beat-pros-in-6-player-poker/
- https://ai.meta.com/blog/cicero-ai-negotiates-persuades-and-cooperates-with-people/ ; https://arxiv.org/abs/2112.07544
- https://deepmind.google/discover/blog/alphastar-grandmaster-level-in-starcraft-ii-using-multi-agent-reinforcement-learning/ ; https://storage.googleapis.com/deepmind-media/research/alphastar/AlphaStar_unformatted.pdf
- https://arxiv.org/abs/2006.01855 ; https://arxiv.org/abs/2409.20553