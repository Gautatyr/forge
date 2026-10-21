# Audit: how the web human seat answers the engine (issue #46)

Scope: every `IGuiGame` method and every `Input` that `PlayerControllerHuman` (with `HumanPlay`, `HumanCostDecision`,
`TargetSelection`, the `forge.gamemodes.match.input` inputs) can use for a human player, and how a `WebGuiGame` seat
handles it. Guard: `SeatCoverageTest` fails when upstream moves any `IGuiGame` method to another class, or when the
answer-needing protocol methods stop matching `Prompt.SHAPED`. Re-audit the changed rows when it fails.

## Root cause of #46
`PlaySpellAbility.chooseOptionalAdditionalCosts` calls `getAbilityToPlay(host, [sa])` with no trigger event for every
triggered ability put on the stack. `WebGuiGame` returned the single ability only if `SpellAbilityView.canPlay()`, which
is false for a `WrappedAbility`, so the trigger was dropped. Fixed: with no trigger event a single ability is returned
as is (`CMatchUI` does the same).

## Silent defaults
A question answered without the player is a silent default. `SilentDefaults.report` logs
`[web] SILENT DEFAULT <where>: <question and answer>` on stderr; with `-Dforge.web.strictPrompts=true` (or
`SilentDefaults.setStrict`) it throws on the asking thread. Reported:
- a seat prompt closed by `TIMEOUT` (`--prompt-timeout`, default 900 s), `DISCONNECTED` (no client for
  `--disconnect-grace`, default 60 s), `CANCELLED` (interrupted), or asked after the seat closed (another game took
  the seat). The client count is the stream's (`GameStream.seatClientCount`): a session that cached it missed a client
  connected before the game bound its seats or kept from the seat's previous game, and closed every prompt open
  longer than the grace as `DISCONNECTED` (found by the sweep; `SeatSessionTest.*PastTheGrace`);
- `SeatSession.sendAndWait` for a method with no prompt shape (would answer null, then `ProtocolGuiGame`'s default);
- every question dialog of `HeadlessWebGui` (`IGuiBase`): `getChoices`, `order`, `showOptionDialog`,
  `showInputDialog`, `chooseCard`, `showFileDialog`, `getSaveFile`.

Strict mode runs in `HumanSeatTriggersTest` and the card-pool sweep (`make web-sweep`).

## IGuiGame methods
Class = the class that answers the call for a `WebGuiGame` (`SeatCoverageTest.EXPECTED`).

### Questions forwarded as seat prompts (13, `Prompt.of`)
| Method | Class | Shape |
| --- | --- | --- |
| `getChoices(String,int,int,List,List,FSerializableFunction)` | ProtocolGuiGame | choose (min −1/max −1 = reveal, max 0) |
| `chooseSingleEntityForEffect`, `chooseEntitiesForEffect` | ProtocolGuiGame | choose, with `reveal` |
| `getAbilityToPlay` | WebGuiGame | 0: null; 1: returned without asking, unless a trigger event and `promptIfOnlyPossibleAbility` (never: the seat sends no trigger event); 2+: choose, nothing disabled (as `CMatchUI` with no event; engine callers pass only what they allow) |
| `showOptionDialog` | ProtocolGuiGame | choose, `default` |
| `confirm(CardView,String,boolean,List)`, `showConfirmDialog(…,boolean)` | ProtocolGuiGame | confirm |
| `order(…,boolean,boolean)`, `manipulateCardList`, `sideboard` | ProtocolGuiGame | order |
| `assignCombatDamage`, `assignGenericAmount` | ProtocolGuiGame | distribute |
| `showInputDialog` | ProtocolGuiGame | text |

`ProtocolGuiGame` falls back to `defaultYes` / `defaultOption` / null when `sendAndWait` returns null. Null comes only from
a reported silent default, or from `ProtocolGuiGame.pause()`, which only `FServerManager` (network host) calls: never
for a web seat.

### Questions delegated to the prompts above
| Method | Class | Delegates to |
| --- | --- | --- |
| `confirm(CardView,String)`, `showConfirmDialog(String,String)`, `showConfirmDialog(…,String,String)` | IGuiGame | the full overload |
| `getChoices(String,int,int,List)` | IGuiGame | `getChoices` (6 args) |
| `oneOrNone`, `reveal` | AbstractGuiGame | `getChoices` |
| `one(String,List,FSerializableFunction)`, `one(String,List)` | AbstractGuiGame, IGuiGame | `getChoices`; one choice is returned without asking (desktop: same) |
| `getInteger(…,boolean)`, `getInteger(…,int)` | AbstractGuiGame | `oneOrNone`, then `showInputDialog` for "Other"; `max <= min` returns min (no choice) |
| `many(…,List,List,CardView)` and its 2 overloads | AbstractGuiGame, IGuiGame | `getChoices` (max 1) or `order` |
| `order(String,String,List,CardView)`, `order(…,boolean)` | IGuiGame | `order` (9 args) |
| `insertInList` | AbstractGuiGame | `oneOrNone` |

### Input display, forwarded as `{"t":"call"}` (no answer; the client answers with actions)
ProtocolGuiGame: `showPromptMessage(PlayerView,String,CardView)`, `updateButtons(…6 args)`, `setSelectables`,
`clearSelectables`, `setSelectableTargets` (players and stack items: `canPickStackTargets` is true), `setHighlighted`,
`setWeaklySelectable`, `clearWeaklySelectable`, `showRevealedCards`, `hideRevealedCards`, `showManaPool`,
`hideManaPool`, `setCard`, `setPanelSelection`, `awaitNextInput`, `updateAutoPassPrompt`, `message(String,String)`,
`showErrorDialog(String,String)`, `flashIncorrectAction`, `alertUser`, `showCombat`, `updateDrawOffer`,
`applyYieldUpdate`, `enableOverlay`, `disableOverlay`, `finishGame`, `afterGameEnd`, `openView` (WebGuiGame),
`setPlayerAvatar`. IGuiGame overloads delegating to these: `showPromptMessage(PlayerView,String)`,
`updateButtons(…4 args)`, `message(String)`, `showErrorDialog(String)`.

### State and events (no player decision)
- Game state travels on the per-viewer stream: `handleGameEvents` (WebGuiGame: also publishes), `handleGameEvent`,
  `setGameView` (ProtocolGuiGame), `applyDelta` (NetworkGuiGame; never received by a server seat).
- Interface no-ops (`IGuiGame` defaults; the stream carries the state): `updateCard(s)`, `updateCardsNetSafe`,
  `updateZones`, `updateLives`, `updateManaPool`, `updateShards`, `updateStack`, `updatePhase`, `updateTurn`,
  `updatePlayerControl`, `updateDependencies`, `refreshCardDetails`, `refreshField`, `refreshYieldUi`,
  `notifyStackAddition`, `notifyStackRemoval`, `handleLandPlayed`, `onSnapshotRestored`, `openZones`,
  `setGameView(GameView,long)`, `showCoinFlip`, `showFlipOntoBattlefield`, `endFlipOntoBattlefield`.
- Local bookkeeping (AbstractGuiGame): `setOriginalGameController` (WebGuiGame: binds the seat's actions),
  `setGameController`, `setSpectator`, `setCurrentPlayer`, `getGameView`, `setNetGame`, `updateRevealedCards`,
  `isSelecting`, `isGamePaused`, `setGamePause`, `getGameSpeed`, `setGameSpeed`, `getDayTime`, `updateDayTime`,
  `cancelAwaitNextInput`.
- Queries: `isNetGame` true (ProtocolGuiGame); `isLibgdxPort` false (`IGuiBase`); `canPickStackTargets` true;
  `isUiSetToSkipPhase` false, unused: `PlayerControllerHuman.isRemoteClient()` (gui is a `ProtocolGuiGame`) reads
  phase stops from its `YieldController`, which the client sets (`sendYieldUpdate SkipPhase`).
- `awaitInput` (WebGuiGame): the game thread waits for the input's latch and runs the seat's actions meanwhile
  (`InputPump`, see Threading); the seat's actions release it.

## Inputs
Each input shows itself with `showPromptMessage` + `updateButtons` (+ selectables / targets / highlights). The client
answers with seat actions (`SeatSession.act`): `selectCard`, `selectPlayer`, `selectStackItem`, `selectAbility`,
`selectButtonOk`, `selectButtonCancel`, `useMana`, `alphaStrike`, `undoLastAction` (`SeatSession.INPUT_ACTIONS`). They run
on the game thread waiting for the input (Threading); one sent while no input waits is logged and not run (no input
would take it).

| Input | Created by | Seat answers with |
| --- | --- | --- |
| `InputPassPriority` | PCH `chooseSpellAbilityToPlay` | selectCard (abilities; 2+ → `getAbilityToPlay` prompt), OK (pass), Cancel, undo; `setWeaklySelectable` = playable cards |
| `InputAttack` | PCH `declareAttackers` | selectCard (toggle), selectPlayer / selectCard (defender), alphaStrike, OK |
| `InputBlock` | PCH `declareBlockers` | selectCard (attacker, then blocker), OK |
| `InputConfirm` | PCH, `InputConfirm.confirm` | OK / Cancel (yes / no labels) |
| `InputConfirmMulligan`, `InputLondonMulligan` | PCH mulligan | OK / Cancel; selectCard (cards to bottom) + OK |
| `InputChooseStartingHand` | PCH `chooseStartingHand` | selectCard (a card of the hand to keep) + OK |
| `InputPayMana`, `InputPayManaOfCostPayment` | `HumanPlay`, PCH | selectCard (mana source; 2+ abilities → `getAbilityToPlay`), useMana (pool), OK (auto-pay), Cancel |
| `InputSelectCardsFromList`, `InputSelectEntitiesFromList`, `InputSelectManyBase` | PCH, `HumanCostDecision` | selectCard / selectPlayer (WebGuiGame names its players as selectable targets), OK, Cancel |
| `InputSelectCardsForConvokeOrImprovise` | PCH | selectCard (creature or artifact to tap), OK |
| `HumanCostDecision.InputSelectCardToRemoveCounter` | `HumanCostDecision` | selectCard (one counter per click), OK |
| `InputSelectTargets` | `TargetSelection` | selectCard / selectPlayer / selectStackItem, OK, Cancel |
| `InputSelectStackItems` | `TargetSelection.chooseStackItemsInView` | selectStackItem, OK, Cancel |
| `InputLockUI` | `InputQueue` (no input) | nothing (waiting display) |
| `InputPlaybackControl` | `FControlGamePlayback` | never for a human seat (AI-only matches) |

## IGuiBase dialogs reached from a human seat
- `HumanCostDecision.putFromSame` asks "whose graveyard" through `SGuiChoose.oneOrNone` (`IGuiBase`, not the seat).
  Reached only by a `PutCardToLibFromSameGrave` cost paid through `CostPayment`; the only card with it, Jötun Grunt
  (cumulative upkeep), pays in `PlaySpellAbility.payCostDuringAbilityResolve`, which asks the seat
  (`chooseSingleEntityForEffect` → `InputSelectEntitiesFromList`; `HumanSeatTriggersTest`). If reached: a reported
  silent default under `HeadlessWebGui`; a Swing dialog under the launcher.
- PCH dev-mode cheats (`getSaveFile`, `showFileDialog`, `SOptionPane.showErrorDialog`): the seat has no dev-mode action.

## Threading (issue #53)
Root cause of the `ConcurrentModificationException`s the sweep saw (about one game in 36: `StaticEffects.clearStaticEffects`,
`TriggerHandler.collectTriggerForWaiting`, the bridge flush `NetworkChecksumUtil` → `Tracker.getDelayedPropsFor`): seat
actions ran on the seat's own thread (`web-seat-N`), unordered with the EDT that displays the input. A mana source clicked
while paying started `InputPayMana.activateManaAbility`, which runs the ability on a new game thread
(`GameAction.invoke` off a game thread), while the EDT refreshed the input (`updateMessage` → `pushActionableCards`, and
`ProtocolGuiGame.setWeaklySelectable` → `updateGameView` flushing events and publishing on the stream). Desktop: clicks and
the refresh share the Swing EDT and the input is locked while the ability runs. Fixed in fork code
(`InputPump`, `WebGuiGame.awaitInput`, `WebGuiGame.updateGameView`); no upstream file changed.
- Actions run on the game thread that waits for the seat's input (`IGuiGame.awaitInput`, upstream's hook for
  single-threaded hosts), in order; engine work they start runs inline there (`GameAction.invoke` on a game thread). An
  action that opens another input (e.g. a cost that asks for a card) waits in it, and the next action answers it.
- An action starts once the EDT has run what was queued before it (the input's display), and the game thread goes back
  to waiting, or on with the game, once the EDT has run what the action queued (`updateMessage`): EDT input work reads the
  game while the game thread waits. Each EDT wait is bounded (10 s, then logged).
- `WebGuiGame.updateGameView` (`ProtocolGuiGame` flushes and walks the game there, from `setWeaklySelectable`,
  `clearWeaklySelectable`, `syncAndSend`): on another thread than the one running the game (the EDT, or a second game
  thread an input started) it runs only while the game thread waits for the seat and runs nothing
  (`InputPump.whileIdle`); otherwise the game thread's next flush carries the changes. This covers the
  EDT timers (`InputLockUI`, `awaitNextInput`) that fire while the game runs.
- Not covered: actions that need no input (`concede`, `reorderHand`, `drawOfferAction`, `sendYieldUpdate`,
  `getActivateDescription`) run on the seat's thread when no input waits, as the desktop runs them on the EDT while the
  game runs; EDT work an action queues can start before that action returns; an input's first display (queued by
  `InputProxy` when the game thread sets the input) can start before the game thread reaches the wait. The sweep fails a
  game on any `ConcurrentModificationException` on a game thread.

## Known gaps outside the bridge
- Frontend: `setSelectableTargets` keeps players only and there is no `selectStackItem` action, so the web screen
  cannot target a spell or ability on the stack (`InputSelectTargets` with stack zones, `InputSelectStackItems`); the
  player can only cancel (a mandatory one cannot be cancelled). The bridge forwards both; the sweep's scripted seat
  answers them.
- Upstream: `TargetSelection.chooseCardFromList` lists zone headers ("--CARDS ON BATTLEFIELD:--") as choices; picking
  one adds no target and asks again (desktop: same).
- Upstream: `InputPayMana` enables Auto when `ComputerUtilMana.getManaSourcesToPayCost` finds sources, but
  `payManaCost` can still fail ("Didn't find what to pay"); Auto then does nothing and stays enabled (desktop: same).
  The player taps sources or cancels; the sweep's seat cancels after 10 tries.
- Upstream: `InputBlock` OK with an unmet block requirement only `message`s the error; the player assigns blocks.
