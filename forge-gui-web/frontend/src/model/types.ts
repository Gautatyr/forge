/**
 * UI view-model for one match, as seen by one player.
 *
 * Components depend only on these types. A later adapter maps the engine
 * bridge's wire format (GameView / PlayerView / CardView / StackItemView
 * deltas, see docs/fork/architecture/web-ui.md) onto them. Nothing here
 * mirrors Java names on purpose: the view-model is shaped for the screen.
 */

export type PlayerId = string;
export type CardId = string;
export type StackItemId = string;

export interface CardImage {
  /** ~488x680, used on the board and in the hand. */
  normal: string;
  /** ~672x936, used by the hover preview and the inspector. */
  large: string;
}

export interface CardFace {
  name: string;
  manaCost: string;
  typeLine: string;
  oracleText: string;
  power?: string;
  toughness?: string;
  loyalty?: string;
  image?: CardImage;
}

export type Zone = 'hand' | 'library' | 'battlefield' | 'graveyard' | 'exile' | 'command' | 'stack';

export interface Counter {
  /** Display name, e.g. "+1/+1", "Experience", "Loyalty". */
  kind: string;
  count: number;
}

/** One line of a P/T breakdown, e.g. "+1/+1 counters ×2" → +2/+2. */
export interface PtModifier {
  source: string;
  power: number;
  toughness: number;
}

/** The card that added a keyword to another card. */
export interface KeywordSource {
  cardId: CardId;
  name: string;
  untilEndOfTurn: boolean;
}

/** One keyword ability on a card, e.g. Flying, Ward {2}, Protection from red. */
export interface CardKeyword {
  /** The keyword without its value, as the engine names it: "Flying", "Ward", "Protection", "Hexproof". */
  name: string;
  /** Full name with its value: "Ward {2}", "Protection from red", "Hexproof from black". */
  label: string;
  /** The engine's English reminder text; shown when we have no line of our own. */
  reminder?: string;
  /** Set when another card added it; absent when the card has it printed. */
  grantedBy?: KeywordSource;
}

export interface CardView {
  id: CardId;
  /** Name of the face currently shown. */
  name: string;
  front: CardFace;
  /** Second face of a transforming or modal double-faced card. */
  back?: CardFace;
  /** True when the back face is the one in play. */
  transformed?: boolean;
  ownerId: PlayerId;
  controllerId: PlayerId;
  zone: Zone;
  isToken: boolean;
  isCommander: boolean;
  tapped: boolean;
  /** Came under its controller's control this turn (creatures only). */
  summoningSick: boolean;
  counters: Counter[];
  /** Damage marked this turn. */
  damage: number;
  /** Current P/T after all effects; undefined for non-creatures. */
  power?: number;
  toughness?: number;
  /** Explains how current P/T differs from the printed one. */
  ptModifiers: PtModifier[];
  /** Every keyword the card has now, printed and added by other cards, in engine order. */
  keywords: CardKeyword[];
  attachedTo?: CardId;
  attachments: CardId[];
}

export interface CommanderDamage {
  commanderId: CardId;
  amount: number;
}

export interface PlayerView {
  id: PlayerId;
  name: string;
  /** Turn order, 0-based; seat 0 is the player this view belongs to. */
  seat: number;
  isYou: boolean;
  isAi: boolean;
  life: number;
  startingLife: number;
  poison: number;
  /** Other player counters: experience, energy… */
  counters: Counter[];
  handCount: number;
  libraryCount: number;
  /** Ordered zones, bottom → top. */
  hand: CardId[];
  battlefield: CardId[];
  graveyard: CardId[];
  exile: CardId[];
  command: CardId[];
  commanders: CardId[];
  /** Times each commander was cast from the command zone (tax = 2× this). */
  commanderCasts: Record<CardId, number>;
  /** Commander damage this player has taken, by source commander. */
  commanderDamageTaken: CommanderDamage[];
  landsPlayedThisTurn: number;
  hasLost: boolean;
  /** Set with `hasLost`: when and why the player left the game (design pass 4 §2.6). */
  out?: PlayerOut;
  /** While the game starts: this player's opening-hand decision (§2.4). Absent once play begins. */
  mulligan?: MulliganState;
  /** Floating mana; absent or all zero when empty. */
  manaPool?: ManaPool;
}

/**
 * Why a player left the game. Names are copied in, so the line still reads
 * after the source has left the game too.
 */
export type OutReason =
  | { kind: 'commanderDamage'; amount: number; commanderName: string }
  | { kind: 'life'; life: number }
  | { kind: 'poison'; count: number }
  | { kind: 'emptyLibrary' }
  | { kind: 'conceded' }
  /** Anything else, as the engine words it ("lost to Approach of the Second Sun"). */
  | { kind: 'other'; text: string };

export interface PlayerOut {
  /** Turn number when the player left. */
  turn: number;
  reason: OutReason;
}

/** London mulligan, per player: deciding, kept N cards, or took a mulligan and goes down to N. */
export type MulliganState =
  | { state: 'deciding' }
  | { state: 'kept'; cards: number }
  | { state: 'mulligan'; cards: number };

/** The game is over (design pass 4 §2.6). */
export interface GameResult {
  /** Absent for a draw. */
  winnerId?: PlayerId;
  /** e.g. "Last player standing." */
  reason: string;
  /** Every player, 1st first. */
  ranking: PlayerId[];
  /** The match has more games: the panel's main button is "Next game". */
  nextGame: boolean;
}

/** One kind of mana: the five colours and colourless ({C}). */
export type ManaColour = 'W' | 'U' | 'B' | 'R' | 'G' | 'C';

/** Floating mana by kind. Empties at the end of each step. */
export type ManaPool = Partial<Record<ManaColour, number>>;

/** A permanent that can add mana now, and the kinds one tap can add (a dual land lists two; you pick one). */
export interface ManaSource {
  cardId: CardId;
  colours: ManaColour[];
}

export type TargetRef = { kind: 'card'; id: CardId } | { kind: 'player'; id: PlayerId };

export interface StackItem {
  id: StackItemId;
  sourceCardId: CardId;
  controllerId: PlayerId;
  kind: 'spell' | 'ability' | 'trigger';
  /** Engine-rendered description, e.g. "Lightning Bolt deals 3 damage to Eidolon of Blossoms". */
  text: string;
  targets: TargetRef[];
}

export type StepId =
  | 'untap'
  | 'upkeep'
  | 'draw'
  | 'main1'
  | 'beginCombat'
  | 'declareAttackers'
  | 'declareBlockers'
  | 'combatDamage'
  | 'endCombat'
  | 'main2'
  | 'end'
  | 'cleanup';

export interface TurnState {
  number: number;
  activePlayerId: PlayerId;
  step: StepId;
  /** Undefined while nobody holds priority (untap, cleanup, mid-resolution). */
  priorityPlayerId?: PlayerId;
}

export interface Attack {
  attackerId: CardId;
  /** The player attacked. Planeswalkers and battles come later. */
  defenderId: PlayerId;
}

export interface Block {
  blockerId: CardId;
  attackerId: CardId;
}

export interface CombatState {
  attacks: Attack[];
  blocks: Block[];
}

/* ---------------------------------------------------------------------------
 * Prompts. The engine's 13 answer-needing messages fit five shapes; one
 * generic choice tray renders them all.
 * ------------------------------------------------------------------------- */

export interface ChoiceOption {
  id: string;
  /** Option text; for an ability its full text ("{2}, {T}, Sacrifice …: Search …"). Never truncated. */
  label: string;
  /** When the option is a card, the tray shows the card image. */
  cardId?: CardId;
  /** When the option is a player (choose a player). */
  playerId?: PlayerId;
  /** Shown under the label, e.g. "14 in library". */
  detail?: string;
  /** Colour choice: the colour's mana symbol, e.g. "{G}". */
  symbol?: string;
  /** Ability menu: the cost as symbols, e.g. "{2}{T}". */
  cost?: string;
}

interface PromptBase {
  id: string;
  /** Short question, e.g. "Scry 2". */
  title: string;
  /** Longer instruction, e.g. "Put any number on the bottom, the rest on top in any order." */
  instruction: string;
  /** Card that caused the prompt, shown in the tray header. */
  sourceCardId?: CardId;
  /** Label of the confirm button, e.g. "Confirm scry". */
  confirmLabel: string;
  /** Player whose action this is (another player's reveal): the title gets their seat shape. */
  byPlayerId?: PlayerId;
}

/**
 * Choose between `min` and `max` options. When every option is a card on the
 * battlefield, a card in your hand or a player, the screen picks them in place.
 * `max` 0 is a reveal or look: nothing to pick, the answer is an empty list (OK).
 */
export interface ChooseNPrompt extends PromptBase {
  shape: 'chooseN';
  options: ChoiceOption[];
  min: number;
  max: number;
  /**
   * The engine asks which ability (or face) of `sourceCardId` to use: drawn as a
   * menu anchored to that card instead of the tray. An empty answer cancels.
   */
  abilityMenu?: boolean;
  /**
   * Counter reads "0 of 1 chosen" and the confirm keeps its plain label (no
   * "(1)"): the mulligan's bottoming (design pass 4 §2.4).
   */
  progress?: boolean;
}

export interface YesNoPrompt extends PromptBase {
  shape: 'yesNo';
  /** Button labels; `{player:<id>}` shows that player's seat shape and name ("Let ▲ Mira start"). */
  yesLabel: string;
  noLabel: string;
  /** The engine's default (primary button, Space). Yes when absent. */
  defaultAnswer?: 'yes' | 'no';
  /** Card shown in the body, e.g. a commander about to change zones. */
  cardId?: CardId;
  /**
   * Keys that answer at once, replacing Y / N; a missing one has no key (Space
   * still answers the default). The mulligan uses `{ no: 'M' }`.
   */
  keys?: { yes?: string; no?: string };
}

/**
 * Order one list (simultaneous triggers: item 0 resolves first), or move items
 * between two lists (scry, surveil, sideboard).
 */
export interface OrderPrompt extends PromptBase {
  shape: 'order';
  lists: { id: string; label: string; hint: string; items: ChoiceOption[] }[];
}

export interface DistributePrompt extends PromptBase {
  shape: 'distribute';
  total: number;
  recipients: ChoiceOption[];
}

export interface InputPrompt extends PromptBase {
  shape: 'input';
  kind: 'number' | 'text';
  min?: number;
  max?: number;
}

export type ChoicePrompt = ChooseNPrompt | YesNoPrompt | OrderPrompt | DistributePrompt | InputPrompt;

/** What the game is waiting for from this player right now. */
export type Decision =
  /**
   * You hold priority. `playable`: what you may play now. Never drawn ("highlights
   * are answers, never hints"); it only answers a click on a card you can't play.
   * `manaSources`: your permanents a click taps for mana (into your pool).
   */
  | { kind: 'priority'; playable: CardId[]; manaSources?: ManaSource[] }
  /** Someone else is deciding. */
  | { kind: 'waiting'; forPlayerId: PlayerId; what: string }
  /** Casting or activating: pick targets among the legal ones (ringed while this is open). */
  | {
      kind: 'chooseTargets';
      sourceCardId: CardId;
      /** e.g. "Choose target creature". */
      instruction: string;
      legal: TargetRef[];
      chosen: TargetRef[];
      min: number;
      max: number;
    }
  /** `draft` is the attack being built; the engine validates on confirm. */
  | { kind: 'declareAttackers'; candidates: CardId[]; defenders: PlayerId[]; draft: Attack[] }
  | { kind: 'declareBlockers'; candidates: CardId[]; attackers: CardId[]; draft: Block[] }
  | { kind: 'choice'; prompt: ChoicePrompt }
  /**
   * Paying the mana cost of a spell or ability (design pass 4, §2.1). The spell
   * goes on the stack as soon as `remaining` is empty: no confirm step.
   */
  | {
      kind: 'payMana';
      /** The spell, or the permanent whose ability is activated. */
      sourceCardId: CardId;
      /** Set when paying for an ability, e.g. "Equip {1}". */
      ability?: string;
      /** Full cost, X already chosen and commander tax included: "{2}{G}{W}". */
      cost: string;
      /** What is left to pay, same notation; "" once paid. */
      remaining: string;
      /** Commander tax included in `cost` (generic mana); 0 when none. */
      tax: number;
      /** The X chosen before payment, when the cost has one. */
      x?: number;
      /** Permanents that can still pay, with the kinds that still help. */
      sources: ManaSource[];
      /** A tap or a pool spend can be undone (Z). */
      canUndoTap: boolean;
      /** What "Pay automatically" would tap, in order; empty when the pool covers it. */
      autoTaps: CardId[];
      /** Untapped sources and the pool cover the rest. */
      autoCanPay: boolean;
    };

export interface LogEntry {
  id: string;
  turn: number;
  playerId?: PlayerId;
  /** Text with card references as {card:<id>} tokens so names are hoverable. */
  text: string;
}

export interface GameView {
  id: string;
  format: 'commander' | 'constructed';
  youId: PlayerId;
  /** In turn order starting with you. */
  players: PlayerView[];
  cards: Record<CardId, CardView>;
  /** Bottom → top. */
  stack: StackItem[];
  turn: TurnState;
  combat?: CombatState;
  decision: Decision;
  /** Pass priority automatically when you have no possible action. Off by default (D4). */
  autoPass: boolean;
  /** Pay mana costs at once when casting. Off (or absent) by default: payment is manual (pass-3 override). */
  autoPay?: boolean;
  /** Honour per-ability auto-yields set on stack items. Off by default (D4). */
  autoYield: boolean;
  /** Card names/abilities the player chose to always yield to. */
  autoYieldTo: string[];
  /** "End turn" was pressed: passing until your next turn. */
  passingUntilYourTurn: boolean;
  log: LogEntry[];
  /** Set once the game is over. */
  result?: GameResult;
}
