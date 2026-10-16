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
  /** Floating mana; absent or all zero when empty. */
  manaPool?: ManaPool;
  /**
   * Yours only: cards outside your hand and command zone you have permission to cast
   * (flashback, escape, foretell, an adventure in exile), whatever you can afford or
   * the timing (design pass 4, P4). Your commanders in the command zone are not
   * repeated here: the hand always shows them.
   */
  otherZoneCasts?: OtherZoneCast[];
}

/** Why a card outside your hand is castable; `other` covers permissions without a caption of their own. */
export type OtherZoneCastVia = 'flashback' | 'escape' | 'foretell' | 'adventure' | 'other';

export interface OtherZoneCast {
  cardId: CardId;
  via: OtherZoneCastVia;
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
}

export interface YesNoPrompt extends PromptBase {
  shape: 'yesNo';
  yesLabel: string;
  noLabel: string;
  /** The engine's default (primary button, Space). Yes when absent. */
  defaultAnswer?: 'yes' | 'no';
  /** Card shown in the body, e.g. a commander about to change zones. */
  cardId?: CardId;
}

/**
 * Order one list (simultaneous triggers: item 0 resolves first), or move items
 * between two lists (scry, surveil, sideboard).
 */
export interface OrderPrompt extends PromptBase {
  shape: 'order';
  lists: { id: string; label: string; hint: string; items: ChoiceOption[] }[];
}

/** One row of a distribute prompt: a card (thumbnail) or a player (seat shape). */
export interface DistributeRecipient extends ChoiceOption {
  /** The engine's minimum for this recipient, e.g. 1 for each target of divided damage. */
  min?: number;
  /** Combat damage: damage that is lethal to this blocker (deathtouch and marked damage counted). */
  lethal?: number;
}

/**
 * Divide `total` among the recipients; every point must be assigned (design pass 4 §2.3).
 * With `combat` it is a combat damage assignment and opens on the automatic assignment.
 */
export interface DistributePrompt extends PromptBase {
  shape: 'distribute';
  total: number;
  recipients: DistributeRecipient[];
  combat?: {
    attackerId: CardId;
    /** The attacker has deathtouch: 1 damage is lethal ("Lethal 1 · deathtouch"). */
    deathtouch: boolean;
    /**
     * Trample: id of the recipient (player or planeswalker) the excess goes to. It may
     * get damage only once every blocker has lethal damage. Absent without trample.
     */
    trampleId?: string;
  };
}

/** A name the engine accepts when you name a card. */
export interface CardNameOption {
  name: string;
  manaCost: string;
  typeLine: string;
  image?: CardImage;
}

/** Type a number (X, "choose a number") or a text; `cardName` names a card. */
export interface InputPrompt extends PromptBase {
  shape: 'input';
  kind: 'number' | 'text' | 'cardName';
  /** Number: the range, shown as "0–7". */
  min?: number;
  max?: number;
  /** The engine's default; the field opens on it. */
  defaultValue?: string;
  /** Name a card: the engine's constraint, shown under the field ("Name a nonland card"). */
  constraint?: string;
  /** Name a card: every name the engine accepts. Confirm needs an exact one. */
  cardNames?: CardNameOption[];
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
  /** Player whose turn it was: Recent draws a divider per turn (design pass 4, P6). */
  turnPlayerId?: PlayerId;
  /** The event made you lose life or a permanent: drawn bold in Recent (design pass 4, P6). */
  youLost?: 'life' | 'permanent';
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
}
