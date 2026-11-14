# Human MTG game data (research report, 2026-11-14)

> Archived research-agent report for the MTG model brainstorm ([README](../README.md)). Verbatim except the title; claims are as of 2026-11-14 and each cites its source. Not a decision.

I found no public bank of recorded human Commander games. The closest thing is a private corpus at Playgroup.gg; everything public is 1v1, per-turn summaries, or outcomes only. All pages were read on 2026-11-14. Marked "(unverified)" means I could not open a primary page for it.

**Corrections to what we already knew**
- **17lands replays are one row per game, not per action.** The site says "one row per turn", but the HOB file has one row per game, with column groups for turns 1–30 (2,323 columns). I checked this on the first 2 MB of the file. Each turn records cards drawn, lands played, spells cast, attackers, blockers, combat damage, end-of-turn board and life, plus the opening hands offered and the one kept. There are no targets, no order within a turn and no priority passes, and the opponent's hand appears only as a count.
- **Size varies a lot by set:** HOB is 179 MB compressed, FIN 452 MB, DSK 570 MB.
- **17lands has no Brawl data.** Its dataset table lists only Limited events (Draft, Sealed, Cube).
- **Maia's scale:** 12 million games for each of 9 rating bands (1100–1900), so about 108 million games in total. Its follow-up paper shows a personal model only helps for players with at least 5,000 games, and does not work at 1,000.

### 1. Sources

| Source | What it records | Formats | Size | Access and license | Useful for (a) imitation learning / (b) human-likeness check / (c) deck modelling |
|---|---|---|---|---|---|
| 17lands replay data | Per-turn summaries per game, plus mulligan hands | Arena Limited, 1v1 | ~23M games across 35 sets (counted by a third-party rebuild on Hugging Face) | Free download, CC BY 4.0 | (a) only parts of a game: mulligans, attacks, play order. (b) Medium, 1v1 only. (c) Low |
| 17lands game and draft data | Outcomes and cards drawn; draft picks | Limited | 27.7M games, 176M picks | CC BY 4.0 | Drafting only |
| Arena `Player.log` with detailed logs on | The game's full state updates, plus the player's own choices. The 17lands client uploads this stream but 17lands publishes only the summaries | Every Arena queue, including Brawl (1v1, 100 cards, 25 life) | Public sample (manasight-corpus): 38 sessions, 35 MB, no Brawl | Sample is Apache/MIT; logs you collect are yours | (a) High quality, but you have to collect it. (b) High |
| Untapped.gg, MTGA Assistant / Aetherhub | Meta statistics; single shared replays | Arena, including three Brawl variants | — | Untapped's terms ban scraping; no dataset | (c) Brawl meta only |
| PDBot logs (MTGO) | Text action log: plays, casts with targets, attacks, triggers. Public information only | About 90% Penny Dreadful 1v1; no Commander seen | About 61,000 matches listed back to January 2024 | One export per match, no bulk dump, no licence stated | (a) Medium, 1v1. (b) Medium |
| MTGO's own logs | Local game log files; MTGO now has a 4-player cEDH queue | All MTGO formats | No public dump found | Each player's own files | Possible collection channel |
| Cockatrice | The server stores every game action as a replay (`store_replays=true`). No rules engine, so actions are raw card moves | Lots of multiplayer Commander | Not public; a replay tool keeps its test data private because replays "can lead to doxing" | Players in the game only | Low: no game meaning to learn from |
| XMage | Replay saving is off by default and marked "not working correctly yet" | — | — | — | None |
| Playgroup.gg | Paper games: players, commanders, winner, how the game ended, life and damage events by turn, mulligans, fun ratings. Playgroup Live (its online table): casts, the turn of each cast, zone moves | Casual Commander, 2–6 players | 780,000+ games; 26,190 Live games by 7,941 players in October 2026 | Commander statistics free under CC BY 4.0; game records only for your own playgroup; for anything else they say "get in touch" | (a) Live data would be the best Commander source, if they share it. (b) High for outcomes. (c) High |
| TopDeck.gg, EDHTop16, cedhstats | Standings, decklists, winner and seats of each pod. No play-by-play | cEDH, 4 players | About 287,000 entries, 58% with a commander recorded | TopDeck API is free with a key and requires credit; EDHTop16 licence not stated | (b) win rate by seat. (c) High for cEDH |
| EDHREC | Aggregated deck statistics (top commander: 59.7K decks over 2 years) | Commander | Total not stated | No API; terms ban copying and downloading | (c) Read only |
| Moxfield | Decklists | All | Not stated | Terms ban robots unless approved | (c) Only with permission |
| Archidekt | Decklists | All | Not stated | Staff say the read API is "open and public" but ask for a link back; deep paging is throttled at 50 pages | (c) Good |
| Forge AI-vs-AI simulations (Hugging Face) | 37,000 Forge AI-vs-AI Commander game logs | Commander | 606 MB | MIT | Not human games |
| Video (Game Knights and similar) | About 85 edited episodes (unverified) | Commander | — | — | Not realistic. Computer-vision projects only recognise cards; nobody has extracted game logs |
| Academic and Kaggle | Draft datasets; a simulated Standard benchmark (arXiv 2605.06066) | — | — | — | No human gameplay logs found |

Not verified: SpellTable (seems to be video only), TableStream (not found at all), Untap.in, the Moxfield and Archidekt playtesters, and Arena Tutor.

### 2. Does a usable Commander human-game corpus exist?
No public one. Playgroup.gg holds the only real one I found: about 26,000 online Commander games a month with card-level casts and zone moves. It is private, and its online table probably does not enforce the rules, so it lacks the set of legal options at each choice (unverified). The closest public substitutes are:
- 17lands per-turn summaries (1v1 Limited);
- PDBot MTGO action logs (1v1, 60-card decks);
- Arena Brawl logs you collect yourself, which are full-state and the format closest to Commander, but 1v1.

### 3. Building our own data
The per-game figures below are my estimates, not sourced.

| Option | Rough volume | Use |
|---|---|---|
| A. A recorder in the fork: for each human choice, save what that seat can see, the legal options, the choice and the time taken. Forge has no saved game log today; I found no code that writes it to disk. | 100–300 real decisions per human seat per game. 2 games a week with 1–4 human seats ≈ 100–400 seat-games a year ≈ 10k–100k decisions | Enough for a test of whether a model plays like humans. Far short of training (Maia used 12M games per band) and of personal styles (at least 5,000 games per person) |
| B. Open the recorder to volunteer Commander players | 100 players × 2 games a week ≈ 10,000 seat-games and 1–3M decisions a year. Diplomacy's 7-player imitation model needed 150,000+ games | Fine-tuning a pretrained model |
| C. Friends export Arena Brawl logs | Arena games are fast, so tens per player per month | Pretraining on 1v1 commander-like play |
| D. Ask the PDBot maintainer for bulk MTGO logs, and collect logs from the MTGO 4-player cEDH queue | About 61,000 matches already logged | Pretraining for 1v1; multiplayer cEDH |
| E. Ask Playgroup.gg for research access | About 300,000 online Commander games a year | The only large multiplayer human source |
| F. 17lands for parts of a game (mulligans, attacks, play order) | 23M games | Pretraining those parts; checking human-likeness in 1v1 |

A realistic mix: train the core with self-play in Forge; use A or B to measure human-likeness and to pull the model toward human play; pretrain the parts of a game on C, D and F; and ask Playgroup.gg about E. The comparison point for large datasets: AlphaStar is reported to have used about 971,000 replays, but that comes from a secondary source I could not confirm in the paper.

### Sources (all read 2026-11-14)
- 17lands: https://www.17lands.com/public_datasets · https://17lands-public.s3.amazonaws.com/analysis_data/helper_files/replay_dtypes.py · replay files (header and sizes checked directly) · https://www.17lands.com/usage_guidelines · https://huggingface.co/datasets/TrevorJS/17lands-corpus · https://github.com/rconroy293/mtga-log-client (`mtga_follower.py`)
- Arena: https://github.com/frankfaustino/manasight-corpus · https://magic.wizards.com/en/formats/brawl · https://untapped.gg/legal/terms-of-service
- MTGO: https://logs.pennydreadfulmagic.com/matches/ and /about/ · https://github.com/PennyDreadfulMTG/Penny-Dreadful-Tools (`logsite/api.py`) · https://github.com/BigPeet/mtgo_utils · https://www.mtgo.com/news/mtgo051226
- Online play: https://github.com/Cockatrice/Cockatrice (`servatrice/servatrice.ini.example`) · https://github.com/djpiper28/Cockatrice-Replay-Tool · https://github.com/magefree/mage (`Mage.Server/config/config.xml`)
- Commander data: https://playgroup.gg/about · https://playgroup.gg/playgroup-live/for-communities · https://playgroup.gg/api-docs/index.html · https://topdeck.gg/docs/tournaments-v2 · https://edhtop16.com/about · https://cedhstats.org/about · https://edhrec.com/terms · https://edhrec.com/commanders · https://moxfield.com/help/terms · https://archidekt.com/forum/thread/40353 · https://archidekt.com/forum/thread/11704454
- Other: https://huggingface.co/datasets/nishtahir/mtg-forge-simulations-commander · https://arxiv.org/abs/2605.06066 · https://github.com/killriam/mtg-replay-notation (a JSON format for recording games, including a Forge guide; no data in it)
- Scale references: https://arxiv.org/abs/2006.01855 (Maia, read in the PDF) · https://arxiv.org/abs/2008.10086 (personal models) · https://arxiv.org/abs/1909.02128 (Diplomacy) · AlphaStar via https://arxiv.org/pdf/2111.07631 (secondary source)

The fork's `docs/fork/audit/ml-ai-feasibility.md` already says "No corpus of Commander games exists". That is still true for public data, but it should mention Playgroup.gg's private corpus.