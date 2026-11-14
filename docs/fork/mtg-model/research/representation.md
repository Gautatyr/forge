# Card, state and action representation (research report, 2026-11-14)

> Archived research-agent report for the MTG model brainstorm ([README](../README.md)). Verbatim except the title; claims are as of 2026-11-14 and each cites its source. Not a decision.

I'd go with **(D), a hybrid**. Describe each card with oracle text plus Scryfall/MTGJSON fields, and add structured tokens from Forge's scripts, joined by card name or oracle_id. Put game state and actions in a small engine-neutral protocol, and let each engine's adapter fill it. Forge's script language works as a card feature source, but it shouldn't be the model's protocol.

## 1. Forge's script language, measured

Repo at `develop` 9466a56b2b1; scripts in `forge-gui/res/cardsfolder`. Counts come from grep plus two small Python scripts.

**The syntax is very regular.** 34,113 files hold 35,075 card faces (`Name:` lines). All 88,629 ability lines (`A:`, `T:`, `S:`, `R:` and the `DB$`/`AB$`/`SP$` SVars) are pure `Key$ Value | …` lists, with no exceptions. A parser is a day's work.

**The vocabulary is larger than the enums suggest.**

| Item | Defined in Java | Used in scripts |
|---|---|---|
| Effect types (`ApiType`) | 204 | 194 |
| Trigger modes (`TriggerType`) | 148 | 139 |
| Static ability modes | 90 | 81 |
| Replacement events | 40 | 34 |
| Keywords (`Keyword` enum) | 203 | 253 distinct `K:` heads |
| Parameter keys | — | 1,297 (572 used 10+ times, 309 used once) |

Several values are small languages of their own:
- 760 property tokens in `Valid*` filters (e.g. `Creature.Other+YouCtrl`), and 1,366 distinct `ValidTgts$` strings.
- 190 `Count$` functions, in 6,082 files.
- 229 `Defined$` values.

Many cards are written as step-by-step code rather than a description of the effect:
- `Remember`/`Imprint` variables in 3,893 files;
- cleanup steps in 2,900;
- `Condition*$` in 2,597.

**AI hints are common, and they belong to Forge's AI.**
- `AILogic$`: 1,814 files, 350 distinct values.
- `AI:RemoveDeck`: 4,679 files (`All` 2,480, `Random` 2,382).
- Hint SVars: `PlayMain1` 1,538, `AttachAILogic` 1,179, `HasAttackEffect` 761, `NeedsToPlay(Var)` 513, `NonStackingEffect` 414, `AIPreference` 247, `SacMe` 223.
- Hints also sit inside effects, such as `IsCurse$` on Bribery.
- In total, 9,971 scripts (29%) carry some AI hint.

**Few cards are special-cased in Java, but the meaning of every key lives there.**
- Card names compared in `equals`/`case` code: 46 in forge-game (about half are keyword-name collisions) and 106 in forge-ai.
- `SpecialCardAi.java` has 46 per-card classes.
- The meaning of the keys lives in 208 effect classes, about 129.5k lines in `forge-game`. `CardFactoryUtil.java` (4,165 lines) turns keywords into abilities.

**Documentation is thin.** `docs/Card-scripting-API/` (8 files, 1,719 lines) mentions only 137 of the 1,297 parameter keys.

**Object identity.** Forge keeps a card's id when it changes zones (`GameAction.java:207` calls `copyCard(false)`). Rule 400.7 says a card that changes zones is a new object; Forge tracks that only through `gameTimestamp` (`Card.equalsWithGameTimestamp`). Per-player visibility is checked by `CardView.canBeShownTo(viewer)`.

**Translating scripts automatically.**
- Syntax is trivial.
- Meaning is hard: every key, the filter language, `Count$` and the `Remember` state each need a definition, and today the only definition is the Java code.
- A deterministic compiler for the common core is realistic. The long tail is not.
- Learned translation fails: Ling et al. 2016 generated XMage Java from 13,297 card texts and got only 4.8% of cards exactly right.

## 2. The options

**XMage for comparison:** 32,824 Java files under `Mage.Sets/src/mage/cards` (magefree/mage master, 2026-11-14). Cards are code, not data; Thousand-Year Storm has its own ability, effect and watcher classes, where Forge needs 6 lines of script.

**MTGJSON and Scryfall** give oracle text, keyword lists, types, cost, P/T and an oracle id, but no structured representation of abilities.

| | Card coverage | Works on other engines | New cards | Effort | Risks |
|---|---|---|---|---|---|
| **(A) Forge scripts as the vocabulary** | 100% of Forge. | Card features: yes, since any engine's cards can be looked up in Forge's scripts by name. State and actions in Forge terms (SpellAbility, ApiType): no. | Good when new cards reuse known keys; new mechanics add unseen tokens. | Low to medium. | Forge's AI hints leak in; step-by-step quirks are not meaning; one effect can be scripted two ways. |
| **(B) Oracle-text embeddings** | 100% of any engine (Scryfall/MTGJSON; Forge's `Oracle:` lines). | Best. | Shown to help: Bertram 2024 predicted 55% of human draft picks on unseen cards; Cardsformer handled unseen Hearthstone cards. | Low: embed every card once, offline. Cardsformer used `all-mpnet-base-v2`; jackmaiorino used OpenAI embeddings, which is paid and would need replacing. | Numbers blur (3 damage vs 6); links from an action to a specific ability are weak. Whether a small text encoder counts as an "LLM" is the owner's call. |
| **(C) New abstract MTG representation** | Whatever the compiler covers: high for the core, the long tail approximated. | High in principle. XMage has no scripts, so it would join by name to a Forge-derived version. | Best, if the representation composes cleanly. | High, months. | Becomes a second rules engine. The deknapp/mulligan precedent: its LLM-compiled card format needed 108 "approximations" across 285 cards in one set. |
| **(D) Hybrid** | 100%. | High. | Text helps with unseen cards; structure keeps the numbers exact. | Medium. | Two feature paths to keep aligned. |

(D) in detail:
- Each card gets an oracle-text vector, structured fields from Scryfall/MTGJSON, and tokens from Forge's scripts (ApiType, trigger mode, main parameters).
- Forge's AI hints are dropped.
- The tokens are joined by oracle_id or name, so an XMage adapter reuses the same features.
- State and actions use the protocol in section 3.

## 3. What an engine-neutral observation/action protocol needs

- **Outer loop:** PettingZoo's AEC style. One agent acts at a time, observations are per agent, illegal moves are handled with masks, and the protocol handles any number of seats. Add OpenSpiel-style per-player information state, plus snapshot and clone so the model can search ahead.
- **Seats:** 4 for Commander, indexed relative to the player (self, left, across, right). It must cover multiplayer priority in turn order, life and commander damage per player, the command zone and commander tax.
- **Object ids:** minted by the adapter, with a new id on every zone change (rule 400.7), plus a `prev_id` link and the oracle_id. Forge's own ids do not change, so the adapter must do this.
- **Hidden information:** each seat sees the public state, its own private cards, and anything revealed to it. Unknown cards appear as placeholder tokens. On Forge, the filter is `CardView.canBeShownTo`. Each observation also carries the events since the seat's last decision.
- **Decision kinds:** a closed set of roughly 25–30. mtg-bench's list is a good base: priority, choose_ability, optional_costs, announce_x, choose_mode, targets, divide, mana_payment, attackers, blockers, assign_damage, order_triggers, scry, search, choose_cards, choose_number, choose_color, confirm, discard, mulligan. These have to cover Forge's 113 `PlayerController` methods; spike-eval already handles 78 decision types.
- **Variable-size legal actions:** each candidate is structured (type, source, ability index, targets, mode, X, cost choice) and scored in a list, like jackmaiorino's up to 64 candidates. Large combinations, such as attacks, blocks or damage splits, are asked one pick at a time, as mtg-bench does.
- **Logging:** one JSONL record per decision (state digest, number of legal actions, choice, phase, time), as the RL researcher asked for on upstream PR 11627.

**Closest existing protocol:** the decision format in mtg-bench's `docs/PROTOCOL.md`, which is meant to work with any engine ("A new engine only has to turn its own decision points into DecisionRequests"). Its limits:
- 2 players only (`you`/`opponent`);
- prompts written for LLMs;
- Forge's AI makes the decision when there are too many options.

The others:
- **spike-eval** gets ids right (stable until a zone change) but is written for LLMs and tied to Forge.
- **jackmaiorino/mage** is the most ML-ready (256 state tokens of 128 floats, hashed card ids, 32-feature candidates) but is XMage-only, 2-player, and its features lose information.

## 4. Open questions

1. Is a small local text encoder, run once to embed cards, acceptable under "no LLM as the player"?
2. Is XMage support a requirement or a nice-to-have? The answer decides whether (C)'s cost is worth paying.
3. Should actions be whole moves (a cast with its targets, X and mode) or a sequence of sub-decisions, which is how Forge asks them?
4. How does an action point to "ability 2 of card X" on any engine? In Forge, abilities do not line up one-to-one with oracle paragraphs, because `CardFactoryUtil` expands keywords into extra abilities.
5. Should Forge's AI hints be dropped, or kept as extra features on Forge only?
6. Where does training data come from (self-play, human games, or Forge logs)? The answer sets how much game history the observation needs.
7. Forge and XMage implement some cards differently, so a model trained on one engine may misjudge them on the other.

A related point: the fork's existing audit (`docs/fork/audit/ml-ai-feasibility.md` §8) already favours Forge scripts as card features. These findings support that, with two refinements: drop the AI hints, and keep the scripts out of the state/action protocol.

## Sources

All read 2026-11-14.
- Repo: the paths cited above. Measurement scripts were throwaway (not kept).
- Upstream PR 11627 comments, read through `gh pr view --comments`.
- https://github.com/zachmay/mtg-bench/blob/master/docs/PROTOCOL.md
- https://github.com/lumlaolao/spike-eval (README, docs/harness/HARNESS-ENV.md)
- https://github.com/deknapp/mulligan (cards/schema.py, cards/compiler.py, engine/actions.py, agents/features.py)
- https://github.com/jackmaiorino/mage (Mage.Player.AIRL/docs/architecture.md, MLPythonCode/generate_card_embeddings.py)
- https://github.com/magefree/mage (card file count through `gh api` tree; ThousandYearStorm.java)
- https://arxiv.org/abs/1603.06744 (Ling et al. 2016; Table 1 and results read from the PDF)
- https://arxiv.org/abs/2407.05879 (Bertram et al. 2024; abstract only)
- https://ebooks.iospress.nl/doi/10.3233/FAIA230581 (Cardsformer, ECAI 2023; landing page only) and https://github.com/WannianXia/Cardsformer (eval.py loads `all-mpnet-base-v2`)
- https://github.com/sbl1996/ygo-agent (embeds card text with an LLM; observation shapes; zero-shot generalisation to new cards is only on its roadmap)
- https://mtgjson.com/data-models/card/card-atomic/
- https://api.scryfall.com/cards/named?exact=Thousand-Year%20Storm (the docs page returned 403, so fields were taken from a live card object)
- https://pettingzoo.farama.org/api/aec/
- https://openspiel.readthedocs.io/en/latest/api_reference.html
- https://gymnasium.farama.org/api/spaces/composite/
- https://github.com/datamllab/rlcard

**Unverified:** the AAMAS 2025 Hearthstone follow-up's use of T5 (search snippet only); how fast Forge scripts new sets; RLCard's per-game action sizes (orders of magnitude only).