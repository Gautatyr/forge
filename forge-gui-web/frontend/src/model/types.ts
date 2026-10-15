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
  /** Keywords granted by effects (printed ones are in the oracle text). */
  grantedKeywords: string[];
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

/** One step of the turn the player stops at, per whose turn it is. */
export interface PhaseStops {
  yourTurn: StepId[];
  opponentsTurn: StepId[];
}

/* ---------------------------------------------------------------------------
 * Prompts. The engine's 13 answer-needing messages fit five shapes; one
 * generic choice tray renders them all.
 * ------------------------------------------------------------------------- */

export interface ChoiceOption {
  id: string;
  label: string;
  /** When the option is a card, the tray shows the card image. */
  cardId?: CardId;
  /** Shown under the label, e.g. "14 in library". */
  detail?: string;
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
}

export interface ChooseNPrompt extends PromptBase {
  shape: 'chooseN';
  options: ChoiceOption[];
  min: number;
  max: number;
}

export interface YesNoPrompt extends PromptBase {
  shape: 'yesNo';
  yesLabel: string;
  noLabel: string;
}

/** Order one list, or move items between two lists (scry, surveil, sideboard). */
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
  /** You hold priority. `playable` cards are lit in hand, on the board and in other zones. */
  | { kind: 'priority'; playable: CardId[] }
  /** Someone else is deciding. */
  | { kind: 'waiting'; forPlayerId: PlayerId; what: string }
  /** Casting or activating: pick targets among the lit ones. */
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
  | { kind: 'choice'; prompt: ChoicePrompt };

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
  stops: PhaseStops;
  /** Pass priority automatically when you have no possible action. Off by default (D4). */
  autoPass: boolean;
  /** Honour per-ability auto-yields set on stack items. Off by default (D4). */
  autoYield: boolean;
  /** Card names/abilities the player chose to always yield to. */
  autoYieldTo: string[];
  /** "End turn" was pressed: passing until your next turn. */
  passingUntilYourTurn: boolean;
  log: LogEntry[];
}
