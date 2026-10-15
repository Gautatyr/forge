# Web UI architecture

Status: planned. Decision recorded in [../decisions.md](../decisions.md).

## The seam
The engine never calls a UI toolkit. A UI plugs in through two interfaces in `forge-gui`:
- `forge.gui.interfaces.IGuiBase`: app-level services (dialogs, images, audio, threading). About 44 methods.
- `forge.gui.interfaces.IGuiGame`: one game as seen by one player. In practice a UI extends `forge.gamemodes.match.AbstractGuiGame` or `forge.gamemodes.net.NetworkGuiGame`.

The UI reads read-only view objects (`GameView`, `PlayerView`, `CardView`, `StackItemView`, `SpellAbilityView` in `forge-game`), never live engine objects. Two production clients already prove the seam: Swing desktop (`CMatchUI`) and libGDX mobile (`MatchController`).

## The existing remote-UI protocol
Forge's network play already sends a whole game to a remote UI. The web bridge reuses this design; it is a new encoding (JSON over WebSocket), not a new protocol.

**Messages:** `forge-gui/src/main/java/forge/gamemodes/net/ProtocolMethod.java` enumerates 60 methods.
- 44 go from the game to the player:
  - **31 state updates** with no reply: `setGameView`, `openView`, `applyDelta`, `applyYieldUpdate`, `afterGameEnd`, `finishGame`, `showCombat`, `showPromptMessage`, `updateButtons`, `updateDrawOffer`, `flashIncorrectAction`, `alertUser`, `enableOverlay`, `disableOverlay`, `showManaPool`, `hideManaPool`, `setPanelSelection`, `setCard`, `setSelectables`, `clearSelectables`, `setHighlighted`, `setSelectableTargets`, `setWeaklySelectable`, `clearWeaklySelectable`, `showRevealedCards`, `hideRevealedCards`, `setRememberedActions`, `nextRememberedAction`, `awaitNextInput`, `message`, `showErrorDialog`.
  - **13 prompts** that need an answer. They fit 5 shapes:

    | Shape | Methods |
    |---|---|
    | Choose N from a list (min/max) | `getChoices`, `chooseSingleEntityForEffect`, `chooseEntitiesForEffect`, `getAbilityToPlay`, `showOptionDialog` |
    | Yes / no | `confirm`, `showConfirmDialog` |
    | Order, or move between two lists | `order`, `manipulateCardList`, `sideboard` |
    | Distribute an amount | `assignCombatDamage`, `assignGenericAmount` |
    | Type a text or number | `showInputDialog` |
- 16 go from the player to the game: `useMana`, `undoLastAction`, `selectPlayer`, `selectCard`, `selectButtonOk`, `selectButtonCancel`, `selectAbility`, `selectStackItem`, `nextGameDecision`, `getActivateDescription`, `concede`, `drawOfferAction`, `alphaStrike`, `reorderHand`, `requestResync`, `sendYieldUpdate`.

Board interaction (cast, target, attack, block) mostly runs through "selectable" highlights (`setSelectables`, `setSelectableTargets`) plus `selectCard` / `selectPlayer` / `selectButtonOk`, not through prompts.

**State sync:** `forge-gui/src/main/java/forge/gamemodes/net/DeltaPacket.java` sends only changed properties of view objects, keyed by `TrackableProperty` (214 property types in `forge-game/src/main/java/forge/trackable/TrackableProperty.java`), with object references replaced by IDs. A JSON encoder over this is generic code, not one handler per property.

## Bridge: per-viewer visibility (wire v2)
Code: `forge-gui-web/src/main/java/forge/web/bridge/` (`GameStream`) and `bridge/visibility/`. Wire v1 is in [spike-report.md](spike-report.md#wire-format-v1); v2 changes:
- One stream per viewer: `/ws?token=T`, `/state?token=T`. Each per-launch token is bound to one view, a seat (N = index in the game's player list) or the spectator, and the seat comes from the token only (a `seat` parameter is ignored; issue #8). The server prints the spectator's page URL and one per seat. `hello.v` is 2. Every snapshot carries `"viewer":{"seat":N,"player":<player id>}` or `{"spectator":true}`; `seq` is per stream.
- Card visibility per viewer follows the engine: `CardView.canBeShownTo(player)` and `canFaceDownBeShownTo(player)` (hidden zones, face-down cards, `PlayerMayLook`, which temporary reveals, scry, surveil and `DelayedReveal` set through `tempShowCards`). A spectator gets only what every seat may see.
- Not visible: an anonymous placeholder, props `Zone`, `Owner`, `Controller` only, no `cardState`. Face-down and face not visible: an allow-list of table state (tapped, counters, attachments, combat…), `CurrentState` `FaceDown` and only that state object. Allow-lists live in `visibility/Projection.java`; a new upstream property stays hidden until added there.
- Such cards travel under an alias id (≥ 2^30), never their engine id. A fresh alias is issued when a card stops being fully visible to that viewer and when its zone is shuffled (`GameEventShuffle`) or reordered. `GameStream.realCardId(seat, wireId)` maps a seat's ids back to engine ids.
- Card references (rules in the `ViewerStream` javadoc):
  - Zone lists (`Hand`, `Library`, `Battlefield`…) name every card by id or alias and follow every id switch. A re-hidden card keeps its slot, so its position still places it, as on a physical table.
  - Other references name a face-down card by its alias, and a hidden card by an *unseen id*: ≥ 2^30, names no object, stable while the card stays hidden, replaced by the engine id once the card is visible in full. `-1` = no card / unknown id. `RevealedCardsCollection` never names an alias.
  - On an id switch, other references follow only public links (alias → engine id; a face-down card that stays on the battlefield). Otherwise a reference that held the engine id gets the unseen id, one that held an alias gets `-1`: an alias re-issued by a hide or a shuffle never reaches them.
- `Remembered` is never sent (its text can name hidden cards). The game log is sent unchanged to every viewer.
- Reveals from a prompt (`tempShowCards` … `endTempShowCards`) reach a seat only if a flush runs while they last; flushes run at priority and end of turn, so a human seat also flushes before every prompt and before its input blocks the game (see below).
- `RevealedCardsCollection` (the reveal history) is one list for the game; a viewer gets the cards it may not see as unseen ids, so it learns how many cards were revealed to someone, not which.
- `--hidden full` (debug) makes every stream omniscient.
- Scripted check: `node spike-viewer/check/ws-check.mjs --token <spectator token> --seat-tokens 0=<t0>,1=<t1> --viewers spectator,0,1` (or `VIEWERS=… spike-viewer/check/measure.sh …`) validates each stream and its visibility rules after every delta.

## Bridge: human seat (issue #8)
Code: `forge-gui-web/src/main/java/forge/web/seat/`. A human seat is `WebGuiGame extends ProtocolGuiGame`; its `IRemote` is `SeatSession`. `HostedMatch` gives the seat a `GameEventForwarder`; each batch is published on the `GameStream` (network play's unfiltered `applyDelta`/`setGameView` are dropped). Everything for a seat travels on that seat's stream, in order with its deltas.

Server to seat (after `hello` and `snapshot`):
- `{"t":"call","method":M,"args":[…]}`: the no-reply `ProtocolMethod`s, positional args as in `IGuiGame`. References: `{"type":"card|player|stackItem","id"}` in the seat's id space (a card the seat may not see: its unseen id or alias), `{"type":"spellAbility","id","card","text"}`; enums by name, records as objects with `kind`, maps as `[{key,value}]`. Input UI comes from `showPromptMessage`, `updateButtons`, `setSelectables`/`clearSelectables` (cards), `setSelectableTargets` (players and stack items; the bridge also sends it for an input that picks players, e.g. who starts the game, which upstream leaves to "click a portrait"), `setHighlighted`, `showRevealedCards`, `awaitNextInput`, `finishGame`.
- `{"t":"prompt","id","method","shape",…}`: the 13 prompts, labels rendered on the server. A card the seat may not see is labelled `Hidden card` / `Face-down card`, never named. Shapes and fields (`forge.web.seat.Prompt`):
  - `choose`: `message`, `min`, `max`, `choices:[{i,label,ref?,disabled?}]`, `selected?`, `default?` (`showOptionDialog`), `card?`, `reveal?:{message,cards}` (`DelayedReveal`). `getChoices` with nothing to pick (a reveal) has `max` 0.
  - `confirm`: `message`, `yes`, `no`, `default`, `card?`.
  - `order`: `choices:[{i,label,ref?,inDest?|movable?}]`; `order` adds `remainingMin`/`remainingMax` (how many may stay out of the result) and `rememberOption`; `manipulateCardList` has `permutation: true`; `sideboard` marks the main deck with `inDest`.
  - `distribute`: `amount`, `amountLabel`, `atLeastOne`, `maySkip`, `choices:[{i,label,ref?,max?,defender?}]`.
  - `text`: `message`, `initial`, `options?`, `numeric`.
- `{"t":"promptClosed","id","reason":"answered|timeout|disconnected|cancelled"}` closes a prompt on every client of the seat.
- A client that (re)connects gets, after its snapshot, the seat's current input calls and its open prompts again.

Seat to server (dropped from a spectator token):
- `{"t":"reply","id","value"}`: `choose` → index array; `confirm` → bool; `order` → `{"order":[indices into choices],"remember":bool}` (the new dest list), `manipulateCardList` → the full permutation, `sideboard` → indices of the new main deck; `distribute` → amounts per choice summing to `amount` (null to skip when `maySkip`); `text` → string, or null to cancel. Validated against the held prompt; a bad reply gets `{"t":"replyRejected","id","reason"}` and the prompt stays open.
- `{"t":"action","method",…}`: `selectButtonOk`, `selectButtonCancel`, `selectCard {card, others?}`, `selectPlayer {player}`, `selectAbility {card, ability}`, `selectStackItem {stackItem}`, `useMana {color}` (colour mask), `undoLastAction`, `concede`, `alphaStrike`, `reorderHand {card, index}`, `getActivateDescription {card}` (answers `{"t":"activateDescription","card","text"}`), `nextGameDecision {decision}`, `drawOfferAction {action}`, `sendYieldUpdate {update}`; `requestResync` is `{"t":"requestResync"}` (a fresh snapshot, then the greeting). `update.kind`: `SkipPhase {turnPlayer, phase, skip}` (phase stops: the server skips none until told), `SetAutoPassUntilEndOfTurn {active}`, `StackYield {active, respectsInterrupts}`, `SetMarker {phaseOwner, phase, atOrPastAtClick}`, `ClearMarker`, `SetDisableYields {disabled}`, `SetDisableTriggers {disabled}`. Card ids are the seat's wire ids, resolved through the seat's stream and the game's zones; an id the seat cannot name gets `{"t":"actionRejected","method","reason"}`. Actions run in order on the seat's own thread.
- Timeouts (`WebMain --prompt-timeout`, `--disconnect-grace`): a prompt waits 15 min for an answer, and 60 s while the seat has no client; then the engine default (`Prompt.fallback`). Inputs (priority, attackers…) wait for the player like the desktop.
- Dev launcher without the Swing app: `make web-server ARGS='--human-seat 0 --mode commander --players 4 --life 40 --deck0 "~/.forge/decks/commander/My Deck.dck"'` (deck files are read only; a missing `--deckK` gets a generated Commander deck). The human plays seat 0 (`HostedMatch` seats humans first); open the URL printed for seat 0. Scripted human seat: `spike-viewer/check/human-run.sh <outdir> <label> <port> <server args>` plays seat 0 with `human-seat.mjs` while `ws-check.mjs` checks the other views.

## Known gotchas
- **Java functions in prompts.** `getChoices` takes an `FSerializableFunction` that renders each choice as text. The server must pre-render labels before sending.
- **Upstream churn.** Last year `ProtocolMethod.java` changed in 27 commits and `TrackableProperty.java` in 26 (about 2 each per month). Generate the TypeScript types from these Java enums at build time, so an upstream change breaks the TypeScript build loudly instead of failing silently in a game.
- **Adapter layer.** UI components should depend on a clean UI view-model, not on the wire format. One adapter maps wire messages to the view-model. This keeps upstream churn out of the components.
- **Card images.** Serve over local HTTP from Forge's existing image cache (`ImageFetcher` downloads from Scryfall into the cache folder).
- **Threading.** Prompts block the game thread until the player answers. The bridge must hold a pending future per prompt and complete it when the answer arrives, as `NetworkGuiGame` / `ReplyPool` already do.
- **Network stack.** `netty-all` 4.1.115 is already a dependency of `forge-gui` and includes HTTP and WebSocket codecs. Jetty 9.4 is declared in `forge-gui/pom.xml` but no Java code uses it.

## Coexistence with the Swing app
During the transition, the Swing app keeps every screen except the match. Starting a match opens the web match screen; Swing windows (preferences, yield settings) can still open from the Java side.
