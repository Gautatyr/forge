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

Deliberate automations (not silent defaults: no player is left to answer; logged `[web] seat N is out of the game: …`
on stdout, never reported):
- a seat out of a game that goes on (its player conceded or lost and the engine removed it from the game's players,
  `SeatSession.outOfGame`): every bridged prompt gets its engine default (`Prompt.fallback`; a reveal closes) at once
  and is not sent (issue #78). The engine still asks such a player, e.g. `Player.revealFaceDownCards` reveals a leaving
  player's face-down cards to every registered player; the out seat's OK held the game up to `--disconnect-grace` /
  `--prompt-timeout`. A player still in `Game.onPlayerLost` is not out: the end-of-game reveal of a 2-player game still
  reaches the losing seat. Its inputs: `WebGuiGame.stopIfOut` (Threading). `HumanSeatConcedeTest.aRevealToEveryPlayer…`,
  `…LastOpponentButOne…`, `…TwoPlayerGameStillSeesTheEndOfGameReveal`; the sweep's seat concedes in every 4th 4-player
  game and fails on a prompt sent after it left.

- "Pass priority after casting" (seat setting, off by default; decisions.md 2026-10-23): the seat's priority input right
  after its own spell or activated ability went on the stack is passed once (`PassAfterCast`, `WebGuiGame.awaitInput`).
  Only that `InputPassPriority`; a cast sent with `hold` keeps it. `HumanSeatPassAfterCastTest`.

- the order of cards put into exile (`order` whose title is the engine's `lblChooseOrderCardsPutIntoExile` and that
  leaves no card out; `Prompt.Order.orderIsMoot`, `SeatSession.sendAndWait`): answered with the engine default (the
  list as given), never sent. Exile has no order in the rules (Living Death asked for one; issue #29 playtest 1 #13).
  Graveyard, library and battlefield orders are still asked: they can matter.

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
ProtocolGuiGame: `showPromptMessage(PlayerView,String,CardView)`, `updateButtons(…6 args)`, `setSelection` (a
`Selection` record: cards to pick with min/max, players and stack items, chosen so far; each prompt sends one when shown,
after each pick and when it stops; ProtocolGuiGame skips one equal to the last; sticky for a reconnecting client;
`chosen` is sent without the spell's kept target marks, which upstream appends to every input while the cost is paid: those of the controller that built the selection, the seat's own or the one for a player it controls (`SeatSession.withoutKeptMarks`);
`InputSelectEntitiesFromList` names its players there, e.g. who starts the game; WebGuiGame adds the cards a card-picking cost input takes, see Inputs), `setWeaklySelectable`, `clearWeaklySelectable`, `showRevealedCards`, `hideRevealedCards`, `showManaPool`,
`hideManaPool`, `setCard`, `setPanelSelection`, `awaitNextInput`, `updateAutoPassPrompt`, `message(String,String)`,
`showErrorDialog(String,String)`, `flashIncorrectAction`, `alertUser`, `showCombat` (WebGuiGame: also sends `blockOptions` during `InputBlock`, `attackOptions` during `InputAttack`), `updateDrawOffer`,
`applyYieldUpdate`, `applyMacroState` (the page has no macros and ignores it), `enableOverlay`, `disableOverlay`, `finishGame`, `afterGameEnd`, `openView` (WebGuiGame),
`setPlayerAvatar`. IGuiGame overloads delegating to these: `showPromptMessage(PlayerView,String)`,
`updateButtons(…4 args)`, `message(String)`, `showErrorDialog(String)`.
A card list in a call, also one in a record (`Selection`), leaves out cards the seat has no id for (`WireArgs.encodeCallArg`): `InputPayMana` recomputes its
auto-pay plan only after a mana ability with a mana cost, so `setWeaklySelectable` can name a Treasure sacrificed since (the sweep's seat clicked it as
id -1: `actionRejected` "unknown card").

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
- Queries: `isNetGame` true (ProtocolGuiGame); `isLibgdxPort` false (`IGuiBase`); `canPickStackTargets` true (stack-only targets: `InputSelectStackItems`; a
  target that may be a spell or a permanent, e.g. Pyroblast: `InputSelectTargets`, which offers the spell as its card and
  its stack entry; the page shows the stack entry only);
  `isUiSetToSkipPhase` false, unused: `PlayerControllerHuman.isRemoteClient()` (gui is a `ProtocolGuiGame`) reads
  phase stops from its `YieldController`, which the client sets (`sendYieldUpdate SkipPhase`).
- Upstream replay recording (`HostedMatch` → `ReplaySession.begin`) skips a human whose gui is a `ProtocolGuiGame`:
  web seats are never recorded and nothing is written to the replay store.
- `awaitInput` (WebGuiGame): the game thread waits for the input's latch and runs the seat's actions meanwhile
  (`InputPump`, see Threading); the seat's actions release it.

## Inputs
Each input shows itself with `showPromptMessage` + `updateButtons` (+ `setSelection`). The client
answers with seat actions (`SeatSession.act`): `selectCard`, `selectPlayer`, `selectStackItem`, `selectAbility`,
`selectButtonOk`, `selectButtonCancel`, `useMana`, `alphaStrike`, `undoLastAction` (`SeatSession.INPUT_ACTIONS`). They run
on the game thread waiting for the input (Threading); one sent while no input waits is logged and not run (no input
would take it).

| Input | Created by | Seat answers with |
| --- | --- | --- |
| `InputPassPriority` | PCH `chooseSpellAbilityToPlay` | selectCard (abilities; 2+ → `getAbilityToPlay` prompt), OK (pass), Cancel, undo; `setWeaklySelectable` = playable cards |
| `InputAttack` | PCH `declareAttackers` | selectCard (toggle), selectPlayer / selectCard (defender), alphaStrike, OK; `setWeaklySelectable` = legal undeclared attackers; `attackOptions` = defenders (#65) |
| `InputBlock` | PCH `declareBlockers` | selectCard (attacker, then blocker; again: removes), OK; `blockOptions` = legal blocks per attacker (#48) |
| `InputConfirm` | PCH, `InputConfirm.confirm` | OK / Cancel (yes / no labels) |
| `InputConfirmMulligan`, `InputLondonMulligan` | PCH mulligan | OK / Cancel; selectCard (cards to bottom) + OK |
| `InputChooseStartingHand` | PCH `chooseStartingHand` | selectCard (a card of the hand to keep) + OK |
| `InputPayMana`, `InputPayManaOfCostPayment` | `HumanPlay`, PCH | selectCard (mana source; 2+ abilities → `getAbilityToPlay`), useMana (pool), selectPlayer (own: 2 life per Phyrexian symbol), OK (auto-pay: taps and spends mana only, #66), Cancel |
| `InputSelectCardsFromList`, `InputSelectEntitiesFromList`, `InputSelectManyBase` | PCH, `HumanCostDecision` | selectCard / selectPlayer (its selection names its players), OK, Cancel |
| `InputSelectCardsForConvokeOrImprovise` | PCH | selectCard (creature or artifact to tap), OK; WebGuiGame adds the cards it takes to its `setSelection` (#70) |
| `HumanCostDecision.InputSelectCardToRemoveCounter` | `HumanCostDecision` | selectCard (one counter per click), OK; WebGuiGame adds the cards it takes to its `setSelection` (#70) |
| `InputSelectTargets` | `TargetSelection` | selectCard / selectPlayer / selectStackItem (a spell that is a card target: PCH `selectStackItem` → `selectAbility`), OK, Cancel |
| `InputSelectStackItems` | `TargetSelection.chooseStackItemsInView` | selectStackItem, OK, Cancel |
| `InputLockUI` | `InputQueue` (no input) | nothing (waiting display) |
| `InputPlaybackControl` | `FControlGamePlayback` | never for a human seat (AI-only matches) |

Inputs that pick cards to pay a cost: `InputSelectEntitiesFromList` / `InputSelectCardsFromList` (sacrifice, discard,
exile, tap-type costs) name their cards themselves (`setSelection`). The other two `InputSelectManyBase` inputs
(convoke / improvise / waterbend, remove counters) name only what is chosen: `WebGuiGame.setSelection` adds the cards
their `getActivateAction` accepts to each selection they send; the input queue observer clears them once the input ends
(issue #70). Delve asks with
prompts (`getChoices` for the count, then one `getChoices` per card). The playable highlights estimate convoke and
improvise for a human with every untapped card that may pay (`PlayerControllerAi.chooseCardsForConvokeOrImprovise`).
`HumanSeatPaymentTest` casts convoke, improvise and delve spells through the seat, each offered as playable first.

Auto-pay (`InputPayMana.onOk`, and its plan for the Auto button and the "Taps: …" preview) runs `ComputerUtilMana`
under a `PlayerControllerAi` flagged `autoPayForHuman`: only mana abilities whose costs are `{T}`, `{Q}` and mana, and no
life for Phyrexian mana (issue #66; upstream edit, `docs/fork/decisions.md` 2026-10-22). A cost those can't pay leaves
Auto disabled; the player pays by hand (mana abilities with other costs ask their own inputs; life: `selectPlayer` on
themselves).

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
(`InputPump`, `WebGuiGame.awaitInput`, `WebGuiGame.updateGameView`, `SeatSession.readGame`); no upstream file changed.
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
- A call to the seat publishes what changed first (`SeatSession.call` → `flush`), under the same rule: an EDT call while
  the game thread waits names cards created since the last flush by their ids. Before, only game-thread calls flushed,
  and an EDT `setWeaklySelectable` (auto-pay plan) could name a card the seat was never told of (id -1; the sweep's
  seat clicked it: `actionRejected` "unknown card").
- A wait ends once the EDT has run what was queued before it ended, also when the input ended on the EDT (its display
  stops it): `InputPayMana.updateMessage` swaps the player's controller for an AI one there (`runAsAi` →
  `Player.runWithController`, game-wide), and the game thread reading it let the AI answer for the human (issue #60).
  Measured: `HumanSeatStackTargetsTest` without its EDT drain, load average ~18 on 8 cores, 0 failures in 8 runs on #59's
  pump (issue: ~1 in 3 before it); `SeatSessionTest.anInputEndedOnTheEdt…` covers the end-of-wait case.
- Actions that need no input (`SeatSession.GAME_ACTIONS`: `concede`, `reorderHand`, `drawOfferAction`,
  `sendYieldUpdate`, `getActivateDescription`) run on the game thread at its next safe point (`InputPump.defer`), in
  order with the seat's other actions: in the seat's next input wait, or when a player gets priority
  (`GameEventPlayerPriority`: state-based actions done, nothing resolving), whichever comes first. Left over when the game
  ends, or sent as it ended: rejected (`actionRejected` "game over"), never applied to the match's next game. Before, they ran on the seat's thread while the game ran: a concede during
  setup crashed `Match.prepareAllZones` (IndexOutOfBounds), one during an AI turn raced the game thread (issue #61).
- Concede during setup: a 2-player game ends at its first safe point (the seat's first setup question, at the latest the
  first priority); a game that goes on without the seat
  (multiplayer) takes it at the first priority, because the engine still asks a player out of the game for its mulligan.
- A seat out of a game that goes on (it conceded at one of its inputs) holds no one up: `WebGuiGame.stopIfOut` stops its
  waiting input unanswered (priority passes; attackers, blockers and payments end with what the seat recorded); its
  prompts get their engine default unsent (Silent defaults, deliberate automations; issue #78).
- A player leaving a game that goes on restarts the priority round with the player who has priority next
  (`SeatSession.SafePoints`, at `GameEventPlayerPriority`): `PhaseHandler` ends a round only when priority comes back to
  the player it started with (`pFirstPriority`), so a round started by the player who left never ended (a concede at an
  AI's priority after the seat passed or cast on its own turn, or at the seat's priority after it cast on an AI's turn).
  The engine covers only the active player leaving at its own priority. Players who already passed in that round are
  asked once more. `HumanSeatConcedeTest.concedeWhileAnAiHoldsPriority…`, `…AfterItCastASpellOnAnAiTurn…`.
- Not covered: EDT work an action queues can start before that action returns; an input's first display (queued by
  `InputProxy` when the game thread sets the input) can start before the game thread reaches the wait; a game action sent
  while a prompt of the seat is open (`SeatSession.call`, not an input) waits for it to be answered or time out. The sweep
  fails a game on any `ConcurrentModificationException` on a game thread.

## Known gaps outside the bridge
- Upstream: `TargetSelection.chooseCardFromList` lists zone headers ("--CARDS ON BATTLEFIELD:--") as choices; picking
  one adds no target and asks again (desktop: same). Not reached by a web seat since the 2026-10-21 sync (#56): with
  `canPickStackTargets` a target zone list with the stack goes to `InputSelectTargets`.
- Upstream: `InputPayMana` enables Auto when `ComputerUtilMana.getManaSourcesToPayCost` finds sources, but
  `payManaCost` can still fail ("Didn't find what to pay"); Auto then does nothing and stays enabled (desktop: same).
  The player taps sources or cancels; the sweep's seat cancels after 10 tries.
- Upstream: `InputBlock` OK with an unmet block requirement only `message`s the error; the player assigns blocks.
