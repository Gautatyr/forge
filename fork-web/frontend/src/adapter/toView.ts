/**
 * Wire state → UI view-model (src/model/types.ts). Pure: reads a LiveSession, returns a GameView.
 * Ids become strings; hidden cards (no cardState for this viewer) stay out of `cards`, so zone
 * lists name only cards the components can draw (opponents' hands become a count).
 */
import type {
  BlockOption,
  CardId,
  CardView,
  ChoiceOption,
  CardFace,
  CardKeyword,
  Counter,
  Decision,
  GameView,
  LogEntry,
  PlayerView,
  StackItem,
  StepId,
  TargetRef,
  Zone,
  CombatState,
  GameResult,
  ManaColour,
  ManaPool,
  ManaSource,
  MulliganState,
  OtherZoneCastVia,
  OutReason,
} from '../model/types';
import type { CardProps, CardStateProps, PhaseType, PlayerProps, ZoneType } from '../wire/generated/wire';
import { engineLog, engineText, targetInstruction } from './engineText';
import { parseImageKey, scryfallLookup, type ImageLookup } from './images';
import { freeMulliganKeep, promptToChoice, promptWords, inputToChoice, SELECT_PROMPT_PREFIX, targetKey, tossChooser } from './prompts';
import { tossTitle } from '../state/gameStart';
import { commanderTax, defendingPlayerOf } from '../model/selectors';
import type { LiveSession } from './session';

const STEP_OF: Record<PhaseType, StepId> = {
  UNTAP: 'untap',
  UPKEEP: 'upkeep',
  DRAW: 'draw',
  MAIN1: 'main1',
  COMBAT_BEGIN: 'beginCombat',
  COMBAT_DECLARE_ATTACKERS: 'declareAttackers',
  COMBAT_DECLARE_BLOCKERS: 'declareBlockers',
  COMBAT_FIRST_STRIKE_DAMAGE: 'combatDamage',
  COMBAT_DAMAGE: 'combatDamage',
  COMBAT_END: 'endCombat',
  MAIN2: 'main2',
  END_OF_TURN: 'end',
  CLEANUP: 'cleanup',
};

const ZONE_OF: Partial<Record<ZoneType, Zone>> = {
  Hand: 'hand',
  Library: 'library',
  Battlefield: 'battlefield',
  Graveyard: 'graveyard',
  Exile: 'exile',
  Command: 'command',
  Stack: 'stack',
};

/** CounterEnumType names → what a player reads on the card. */
const COUNTER_NAMES: Record<string, string> = { P1P1: '+1/+1', M1M1: '-1/-1', LOYALTY: 'Loyalty' };

export function counterName(kind: string): string {
  return COUNTER_NAMES[kind] ?? kind.charAt(0) + kind.slice(1).toLowerCase().replace(/_/g, ' ');
}

function counters(map: Record<string, number> | undefined, skip: string[] = []): Counter[] {
  return Object.entries(map ?? {})
    .filter(([k, n]) => n > 0 && !skip.includes(k))
    .map(([k, n]) => ({ kind: counterName(k), count: n }));
}

/** Faces with no card of their own (face-down, hidden…): no name to look up. */
const SPECIAL_FACE = /^t:(hidden|morph|manifest|cloaked|foretell)$/;

/**
 * A view image key → the lookup's image. `c:<name>|<set>|<art index>` names the card by name and set (the
 * view has no collector number); other keys (tokens `t:…`) go by the face's name.
 */
export function imageFromKey(key: string | undefined, back = false, lookup: ImageLookup = scryfallLookup, name = ''): CardFace['image'] {
  if (!key) return undefined;
  const card = parseImageKey(key);
  return card ? lookup({ key, ...card, back }) : lookup({ key, name: SPECIAL_FACE.test(key) ? '' : name, set: '', back, token: true });
}

/** "Flying (reminder…)" → keyword; the name is the label without its value ("Ward {2}" → "Ward"). */
export function parseKeyword(text: string): CardKeyword {
  const m = /^(.*?)\s*\((.*)\)\s*$/s.exec(text);
  const label = (m ? m[1]! : text).trim();
  const reminder = m?.[2]?.trim() || undefined;
  const name = label.split(/\s(?=\{|\d|from\b|[-–—]|:)/)[0]!.trim();
  return reminder ? { name, label, reminder } : { name, label };
}

const cleanText = (s: string | undefined) => (s ?? '').replace(/\r\n?/g, '\n');
const typeLineOf = (s: string | undefined) => (s ?? '').replace(/ - /g, ' — ');

function face(p: CardStateProps, fallbackName: string, back: boolean, images: ImageLookup): CardFace {
  const type = typeLineOf(p.Type);
  const creature = /\bCreature\b/.test(type);
  const f: CardFace = {
    name: p.Name || fallbackName,
    manaCost: p.ManaCost ?? '',
    typeLine: type,
    oracleText: cleanText(p.OracleText || p.AbilityText),
    image: imageFromKey(p.ImageKey, back, images, p.Name),
  };
  if (creature) {
    f.power = String(p.Power ?? 0);
    f.toughness = String(p.Toughness ?? 0);
  }
  if (/\bPlaneswalker\b/.test(type) && p.Loyalty) f.loyalty = p.Loyalty;
  return f;
}

const sid = (n: number) => String(n);

/** A spell you are casting known only by name (LiveSession.castNamed). */
function namedSpell(named: { id: number; name: string }, you: string): CardView {
  return {
    id: sid(named.id),
    name: named.name,
    front: { name: named.name, manaCost: '', typeLine: '', oracleText: '' },
    ownerId: you,
    controllerId: you,
    zone: 'stack',
    isToken: false,
    isCommander: false,
    tapped: false,
    summoningSick: false,
    counters: [],
    damage: 0,
    ptModifiers: [],
    keywords: [],
    attachments: [],
  };
}

/** A player of this game, or undefined (the engine sends -1 for cards outside the game, e.g. a mutated card's merged copy). */
function gamePlayer(s: LiveSession, id: number | undefined): number | undefined {
  return id !== undefined && (s.gameObject?.props.Players ?? []).includes(id) ? id : undefined;
}

/** Undefined for cards this viewer can't see, cards in no drawn zone, and cards of no player of the game. */
export function mapCard(s: LiveSession, id: number, images: ImageLookup = scryfallLookup): CardView | undefined {
  const card = s.get('card', id) ?? s.limboCard(id);
  if (!card) return undefined;
  const cp: CardProps = card.props;
  const zone = cp.Zone ? ZONE_OF[cp.Zone] : undefined;
  const owner = gamePlayer(s, cp.Owner) ?? gamePlayer(s, cp.Controller);
  if (!zone || owner === undefined) return undefined;
  const controller = gamePlayer(s, cp.Controller) ?? owner;
  const current = cp.CurrentState ?? 'Original';
  const cur = s.cardState(id, current);
  if (!cur) return undefined; // hidden from this viewer
  const original = current === 'Original' ? cur : s.cardState(id, 'Original');
  const alt = cp.AlternateState ? s.cardState(id, cp.AlternateState) : undefined;
  const frontState = original ?? cur;
  const backState = current !== 'Original' && original ? cur : alt;
  const faceDown = current === 'FaceDown';
  // A face-down card you may look at (your foretold card, your morph): the bridge sends you its real face too, and
  // it names the card for you (issue #80). Others get the face-down face only.
  const seen = faceDown && original !== undefined && original !== cur;
  const downName = cur.props.Name || 'Face-down card';
  const name = seen ? original.props.Name || cp.Name || '?' : faceDown ? downName : cp.Name || cur.props.Name || '?';
  const front = face(frontState.props, name, false, images);
  const back = backState && backState !== frontState ? face(backState.props, faceDown ? downName : name, true, images) : undefined;
  const transformed = backState === cur && back !== undefined;
  // A face-down card is a 2/2 creature only on the battlefield (a foretold card in exile is no 2/2).
  const creature = /\bCreature\b/.test(typeLineOf(cur.props.Type)) && (!faceDown || zone === 'battlefield');
  const attached = cp.EntityAttachedTo;
  const protector = gamePlayer(s, cp.ProtectingPlayer);
  return {
    id: sid(id),
    name,
    front,
    back,
    transformed,
    ...(faceDown ? { faceDown: { seen, ...(cp.Foretold === true ? { foretold: true } : {}) } } : {}),
    ownerId: sid(owner),
    controllerId: sid(controller),
    zone,
    isToken: cp.Token === true,
    isCommander: cp.IsCommander === true,
    tapped: cp.Tapped === true,
    summoningSick: cp.Sickness === true && creature && zone === 'battlefield',
    counters: counters(cp.Counters),
    damage: cp.Damage ?? 0,
    power: creature ? (cur.props.Power ?? 0) : undefined,
    toughness: creature ? (cur.props.Toughness ?? 0) : undefined,
    ptModifiers: [],
    keywords: (cur.props.Keywords ?? []).map(parseKeyword),
    attachedTo: attached?.type === 'card' ? sid(attached.id) : undefined,
    attachments: (cp.AttachedCards ?? []).map(sid),
    ...(protector !== undefined ? { protectorId: sid(protector) } : {}),
  };
}

/** Log text with "Name (id)" turned into {card:id} tokens for cards this viewer can see, the rest as player words (engineText). */
export function logText(text: string, cards: Record<string, CardView>, seatName?: string): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(/ \((\d+)\)/g)) {
    const c = cards[m[1]!];
    const before = text.slice(last, m.index);
    const name = c ? [c.name, c.front.name, c.back?.name].find((n) => n && before.endsWith(n)) : undefined;
    out += name ? `${before.slice(0, before.length - name.length)}{card:${c!.id}}` : before + m[0];
    last = m.index + m[0].length;
  }
  return engineLog(out + text.slice(last), seatName);
}

/** "Pay Mana Cost: {2}{G}" (InputPayMana). */
export const PAY_COST = /Pay Mana Cost:\s*(\S+)/;
/** InputPayManaOfCostPayment with Phyrexian mana (or "pay life instead of {B}"): a click on your player pays 2 life. */
const LIFE_PAYS = /Click on your life total to pay life/;
/** InputSelectCardsForConvokeOrImprovise: "Choose artifact to tap for Improvise.\nRemaining mana cost is {5}{B}{B}". */
const TAP_TO_PAY = /Choose (artifact or creature|creature|artifact) to tap for (\w+)\.\s*Remaining mana cost is (\S+?)\.?(?=\s|$)/;
const TAP_TO_PAY_KIND: Record<string, string> = {
  artifact: 'artifacts',
  creature: 'creatures',
  'artifact or creature': 'artifacts or creatures',
};
const ATTACK_CANCEL = new Set(['Alpha Strike', 'Call Back']);

/** Pool keys are MagicColor bytes ("1" white … "16" green, "0" colourless). */
const POOL_KEY: Record<string, ManaColour> = { '1': 'W', '2': 'U', '4': 'B', '8': 'R', '16': 'G', '32': 'C', '0': 'C', W: 'W', U: 'U', B: 'B', R: 'R', G: 'G', C: 'C' };

export function manaPool(mana: Record<string, number> | undefined): ManaPool | undefined {
  const out: ManaPool = {};
  for (const [k, n] of Object.entries(mana ?? {})) {
    const c = POOL_KEY[k];
    if (c && n > 0) out[c] = (out[c] ?? 0) + n;
  }
  return Object.keys(out).length ? out : undefined;
}

const WUBRG: ManaColour[] = ['W', 'U', 'B', 'R', 'G'];

/**
 * The kinds a source adds, specific ones first, "any colour" last (Vivid Marsh: B then any; Haven of the
 * Spirit Dragon: C then any). Lands carry OrigProduceMana (a ColorSet name: "B", "GU", "C") and
 * OrigProduceAnyMana; other sources (Sol Ring, dorks) only their rules text.
 */
function produced(s: LiveSession, id: number): ManaColour[] {
  const card = s.get('card', id);
  const st = s.cardState(id, card?.props.CurrentState ?? 'Original')?.props;
  if (!st) return [];
  const kinds = new Set<ManaColour>((st.OrigProduceMana ?? '').match(/[WUBRGC]/g) as ManaColour[] | null);
  let any = st.OrigProduceAnyMana === true;
  // Quoted text is another object's ability (a Gold token's "Sacrifice this token: Add …"), not this card's.
  const text = (st.OracleText || st.AbilityText || '').replace(/"[^"]*"|“[^”]*”/g, '');
  for (const line of text.split(/\n/)) {
    const add = /:\s*Add\s+(.*)/i.exec(line)?.[1];
    if (!add) continue;
    for (const m of add.matchAll(/\{([WUBRGC])\}/g)) kinds.add(m[1] as ManaColour);
    if (/any colou?r|any combination of colou?rs/i.test(add)) any = true;
  }
  if (any) for (const c of WUBRG) kinds.add(c);
  return [...kinds];
}

/**
 * A source of the live game: one click taps it, and the engine asks which ability when there are several,
 * so the view names one colour (the first it adds) and the screen's own colour chooser stays out.
 */
function manaSource(s: LiveSession, id: number): ManaSource {
  const kinds = produced(s, id);
  return { cardId: sid(id), colours: kinds.length ? [kinds[0]!] : [] };
}

/**
 * InputBlock. What may block what is the engine's (issue #48): its blockOptions, per attacker, and before they arrive
 * the creatures it lights (setWeaklySelectable: able to block some attacker). The draft is the blocks of the creatures
 * you declare for, as the engine holds them (plannedBlockers).
 */
function declareBlockers(s: LiveSession, view: Omit<GameView, 'decision'>, combat: CombatState): Decision {
  const known = (id: number) => (view.cards[sid(id)] ? [sid(id)] : []);
  const options: BlockOption[] | undefined = s.blockOptions?.flatMap((o) =>
    known(o.card).map((attackerId) => ({
      attackerId,
      blockers: o.blockers.flatMap(known),
      ifFreed: o.ifFreed.flatMap(known),
      min: o.min ?? 1,
    })),
  );
  const offered = options
    ? options.flatMap((o) => [...o.blockers, ...o.ifFreed])
    : [...s.weakly.keys()].map(sid).filter((id) => view.cards[id]?.zone === 'battlefield');
  const mine = (id: CardId) => offered.includes(id) || view.cards[id]?.controllerId === view.youId;
  const draft = combat.blocks.filter((b) => mine(b.blockerId));
  const attackers = options
    ? options.filter((o) => o.blockers.length || o.ifFreed.length || draft.some((b) => b.attackerId === o.attackerId)).map((o) => o.attackerId)
    : combat.attacks.filter((a) => a.defenderId === view.youId).map((a) => a.attackerId);
  const candidates = [...new Set([...offered, ...draft.map((b) => b.blockerId)])];
  return { kind: 'declareBlockers', candidates, attackers, draft, ...(options ? { options } : {}) };
}

/** A target as a tray option: a card shows its image, a player its plate, a stack item its source and text. */
function targetOption(view: Omit<GameView, 'decision'>, t: TargetRef): ChoiceOption {
  const id = targetKey(t);
  if (t.kind === 'card') return { id, label: view.cards[t.id]!.name, cardId: t.id };
  if (t.kind === 'player') return { id, label: view.players.find((p) => p.id === t.id)!.name, playerId: t.id };
  const item = view.stack.find((it) => it.id === t.id)!;
  const name = view.cards[item.sourceCardId]?.name;
  const label = name ? (item.kind === 'spell' ? name : `${name} (${item.kind})`) : item.text;
  return { id, label, ...(name && item.text ? { detail: item.text } : {}) };
}

function decisionFor(s: LiveSession, view: Omit<GameView, 'decision'>): Decision {
  const you = Number(view.youId);
  const holderId = () => {
    const holder = view.turn.priorityPlayerId ?? view.turn.activePlayerId;
    return view.players.some((p) => p.id === holder) ? holder : view.youId;
  };
  const waiting = (what?: string): Decision => {
    const id = holderId();
    const who = view.players.find((p) => p.id === id);
    return { kind: 'waiting', forPlayerId: id, what: what ?? (who && !who.isYou ? `${who.name} is deciding` : 'Waiting for the game') };
  };
  if (s.finished) return waiting('Game over');
  const prompt = s.prompt;
  if (prompt) return { kind: 'choice', prompt: promptToChoice(prompt, view.cards, view.players.map((p) => p.id)) };

  const input = s.input;
  const mine =
    input.ownerId === you && (input.ok.enabled || input.cancel.enabled || !!input.selectable || input.targets.length > 0);
  if (!mine) return waiting();
  // Nothing to decide (a free mulligan's "return 0 cards"): useLive answers it (commands.ts, autoAnswer).
  if (freeMulliganKeep(input)) return { kind: 'waiting', forPlayerId: view.youId, what: 'Drawing your new hand' };

  const youView = view.players.find((p) => p.isYou)!;
  const weakly = [...s.weakly.keys()];
  // The engine's ref to the spell being cast can be unknown (-1): fall back to the card you clicked. An input
  // that names no card (discard to hand size, who starts) is for no spell, whatever was clicked before.
  const known = (id: number | undefined) => (id !== undefined && id >= 0 && view.cards[sid(id)] ? sid(id) : undefined);
  // After a reload no click is known: the targeting message names the spell (s.castNamed, drawn by toGameView).
  const castCard = () =>
    known(input.cardId) ?? (input.namesCard ? (known(s.lastCard) ?? known(s.castNamed?.id)) : undefined) ?? '';
  // The input's Cancel, unless its button does something else (InputSelectEntitiesFromList's "Select all").
  const cancellable = input.cancel.enabled && input.cancel.label === 'Cancel';

  const pay = PAY_COST.exec(input.message);
  if (pay) {
    const remaining = pay[1] === '0' ? '' : pay[1]!;
    const sourceCardId = castCard();
    const cost = s.payment?.cost ?? remaining;
    // Commander tax (CostAdjustment): 2 per earlier cast, for your commander cast from the command zone (issue #67).
    const fromCommand = sourceCardId !== '' && sourceCardId === sid(s.lastCard ?? -1) && s.lastCardFrom === 'Command';
    const tax = fromCommand && youView.commanders.includes(sourceCardId) ? commanderTax(youView, sourceCardId) : 0;
    const sources = weakly
      .filter((id) => view.cards[sid(id)]?.zone === 'battlefield' && !view.cards[sid(id)]?.tapped)
      .map((id) => manaSource(s, id));
    return {
      kind: 'payMana',
      sourceCardId,
      cost,
      remaining,
      tax,
      sources,
      canUndoTap: false,
      autoTaps: [...s.weakly.entries()]
        .filter(([id, n]) => n >= 2 && view.cards[sid(id)] && !view.cards[sid(id)]!.tapped)
        .map(([id]) => sid(id)),
      autoCanPay: input.ok.enabled && input.ok.label === 'Auto',
      lifePays: LIFE_PAYS.test(input.message),
    };
  }

  // Cards the engine shows you (an opponent's hand, a revealed card): look, then OK.
  const shown = s.revealed.map(sid).filter((id) => view.cards[id]);
  if (shown.length && input.ok.enabled && !/^Priority:/.test(input.message)) {
    const msg = input.message.trim();
    return {
      kind: 'choice',
      prompt: {
        id: `input:ok:reveal:${shown.join(',')}`,
        shape: 'chooseN',
        ...promptWords(msg, undefined, 'Revealed cards'),
        confirmLabel: input.ok.label || 'OK',
        min: 0,
        max: 0,
        options: shown.map((id) => ({ id, label: view.cards[id]!.name, cardId: id })),
      },
    };
  }

  // Mulligan and the London mulligan's bottom cards: tray prompts answered with buttons and hand clicks.
  const early = inputToChoice(input, view);
  if (early && /^input:(mulligan|bottom):/.test(early.id)) return { kind: 'choice', prompt: early };

  const combat = view.combat ?? { attacks: [], blocks: [] };
  if (view.turn.step === 'declareAttackers' && view.turn.activePlayerId === view.youId && ATTACK_CANCEL.has(input.cancel.label)) {
    // The engine's candidates (InputAttack's setWeaklySelectable: undeclared legal attackers) and the declared ones.
    const candidates = [...new Set([...weakly.map(sid), ...combat.attacks.map((a) => a.attackerId)])];
    // What you may attack is the engine's (attackOptions: the combat's defenders, issue #65); before it arrives, your
    // opponents still in the game.
    const options = s.attackOptions;
    const inGame = (id: string) => view.players.some((p) => p.id === id && !p.isYou && !p.hasLost);
    return {
      kind: 'declareAttackers',
      candidates: candidates.filter((id) => view.cards[id]?.zone === 'battlefield'),
      defenders: options
        ? options.filter((d) => d.type === 'player').map((d) => sid(d.id)).filter(inGame)
        : view.players.filter((p) => !p.isYou && !p.hasLost).map((p) => p.id),
      defenderCards: (options ?? []).filter((d) => d.type === 'card').map((d) => sid(d.id)).filter((id) => view.cards[id]?.zone === 'battlefield'),
      draft: combat.attacks,
    };
  }
  if (view.turn.step === 'declareBlockers' && view.turn.activePlayerId !== view.youId && !/^Priority:/.test(input.message) && /block/i.test(input.message)) {
    return declareBlockers(s, view, combat);
  }
  // InputPassPriority: OK + End Turn / Undo.
  if (input.ok.label === 'OK' && /^(End Turn|Undo)/.test(input.cancel.label)) {
    const playable = weakly.map(sid).filter((id) => view.cards[id] && view.cards[id]!.zone !== 'battlefield');
    // Your untapped permanents with a mana ability (actionable highlights leave mana abilities out).
    const manaSources = youView.battlefield
      .filter((id) => !view.cards[id]?.tapped && produced(s, Number(id)).length > 0)
      .map((id) => manaSource(s, Number(id)));
    return { kind: 'priority', playable, manaSources };
  }
  if (input.selectable || input.targets.length > 0) {
    // A ref the view can show: a visible card, a player of the game, an item on the stack.
    const shown = (r: { type: string; id: number }): TargetRef | undefined => {
      const id = sid(r.id);
      if (r.type === 'card') return view.cards[id] ? { kind: 'card', id } : undefined;
      if (r.type === 'player') return view.players.some((p) => p.id === id) ? { kind: 'player', id } : undefined;
      if (r.type === 'stackItem') return view.stack.some((it) => it.id === id) ? { kind: 'stackItem', id } : undefined;
      return undefined;
    };
    // setSelection names the cards, then the players and stack items. A spell that is a card target is also offered
    // as its stack entry (InputSelectTargets, "target spell or permanent"): one target, its stack entry.
    const offeredItems = input.targets.flatMap((t) => (t.type === 'stackItem' ? [shown(t)] : []));
    const asItem = new Set(offeredItems.flatMap((t) => (t ? [view.stack.find((it) => it.id === t.id)!.sourceCardId] : [])));
    const notAsItem = (t: TargetRef) => t.kind !== 'card' || !asItem.has(t.id);
    const legal: TargetRef[] = [
      ...(input.selectable?.cards ?? []).map((id) => ({ type: 'card', id })),
      ...input.targets.filter((t) => t.type !== 'card'),
    ]
      .flatMap((r) => shown(r) ?? [])
      .filter(notAsItem);
    const chosen: TargetRef[] = input.highlighted.flatMap((h) => shown(h) ?? []).filter(notAsItem);
    // Picks the board can't take (library cards, graveyards…) or that are not for a spell or ability
    // (who starts): a tray list. Each pick is a selectCard / selectPlayer / selectStackItem, then OK (selectionFrames).
    // Stack items are always targets of a spell or ability and always on screen: board path even when no cast card is
    // known (reconnect), which also needs no max (InputSelectStackItems sends none) and keeps Cancel.
    const onBoard = (t: TargetRef) =>
      t.kind !== 'card' || ['battlefield', 'stack'].includes(view.cards[t.id]!.zone) || youView.hand.includes(t.id);
    const forSpell = castCard() !== '' || legal.every((t) => t.kind === 'stackItem');
    if (legal.length && (!forSpell || !legal.every(onBoard))) {
      const msg = input.message.replace(/\s*\(Click on the portrait\.?\)/i, '').trim();
      const source = known(input.cardId);
      const toss = tossChooser(msg);
      return {
        kind: 'choice',
        ...(cancellable ? { cancellable } : {}),
        prompt: {
          id: `${SELECT_PROMPT_PREFIX}${legal.map(targetKey).join(',')}|${msg}`,
          shape: 'chooseN',
          // "Cultivate (12)\nSelect up to 2 cards from your library", "Cleanup Phase\nSelect 2 card(s) to discard…"
          ...(toss ? { title: tossTitle(toss), instruction: '', quiet: true } : promptWords(msg, undefined, 'Choose')),
          ...(source || castCard() ? { sourceCardId: source ?? castCard() } : {}),
          confirmLabel: input.ok.label || 'OK',
          options: legal.map((t) => targetOption(view, t)),
          min: input.selectable?.min ?? (input.ok.enabled ? 0 : 1),
          max: Math.min(legal.length, input.selectable?.max ?? 1),
        },
      };
    }
    // Convoke, improvise: the bridge names the permanents the input takes (issue #70); each click taps one for the cost.
    const tap = TAP_TO_PAY.exec(input.message);
    if (tap) {
      const left = tap[3] === '0' ? 'nothing' : tap[3];
      return {
        kind: 'chooseTargets',
        sourceCardId: castCard(),
        instruction: `Tap ${TAP_TO_PAY_KIND[tap[1]!]} to pay for ${tap[2]} — ${left} left`,
        legal,
        chosen,
        min: 0,
        max: legal.length,
        tapToPay: true,
      };
    }
    // "Bolt (12) - Deal 3 damage…\n\nSelect any target": the last line is the instruction.
    const instruction = targetInstruction(input.message);
    const max = input.selectable?.max ?? Math.max(1, chosen.length + 1);
    const info = input.info;
    if (info?.kind === 'pick') {
      // A cost or an effect's pick (issue #81): the input's own min, its Cancel only when the engine allows it.
      return {
        kind: 'chooseTargets',
        sourceCardId: castCard(),
        instruction,
        legal,
        chosen,
        min: input.selectable?.min ?? (input.ok.enabled ? chosen.length : chosen.length + 1),
        max,
        purpose: 'pick',
        cancellable,
        ...(info.decline && cancellable ? { decline: info.decline } : {}),
      };
    }
    return {
      kind: 'chooseTargets',
      sourceCardId: castCard(),
      instruction,
      legal,
      chosen,
      min: input.ok.enabled ? chosen.length : Math.max(chosen.length + 1, input.selectable?.min ?? 1),
      max,
      ...(info ? { purpose: 'target' as const } : {}),
      ...(info?.ability ? { ability: info.ability } : {}),
    };
  }
  const buttons = early ?? inputToChoice(input, view);
  return buttons ? { kind: 'choice', prompt: buttons } : waiting();
}

/** "AI 1 (Deck) has kept a hand of 7 cards" / "… has mulliganed down to 6 cards." */
function mulliganStates(s: LiveSession, players: { id: number; name: string }[]): Map<number, MulliganState> {
  const out = new Map<number, MulliganState>();
  for (const e of s.log) {
    if (e.type !== 'MULLIGAN') continue;
    const p = players.find((x) => e.msg.startsWith(x.name));
    if (!p) continue;
    const kept = /has kept a hand of (\d+) cards/.exec(e.msg);
    const mull = /mulliganed down to (\d+) cards/.exec(e.msg);
    if (kept) out.set(p.id, { state: 'kept', cards: Number(kept[1]) });
    else if (mull) out.set(p.id, { state: 'mulligan', cards: Number(mull[1]) });
  }
  return out;
}

function outReason(s: LiveSession, p: PlayerProps, cards: Record<string, CardView>, poisonToLose = 10): OutReason {
  for (const [cid, amount] of Object.entries(p.CommanderDamage ?? {})) {
    if (amount >= 21) return { kind: 'commanderDamage', amount, commanderName: cards[cid]?.name ?? s.get('card', Number(cid))?.props.Name ?? 'a commander' };
  }
  if ((p.Counters?.POISON ?? 0) >= poisonToLose) return { kind: 'poison', count: p.Counters!.POISON! };
  if ((p.Life ?? 0) <= 0) return { kind: 'life', life: p.Life ?? 0 };
  return { kind: 'other', text: 'lost the game' };
}

/** Client-side settings of the live source (no wire form, or kept by the client). */
export interface LiveLocal {
  autoPay: boolean;
  passingUntilYourTurn: boolean;
  /** Turn number when "To my turn" was pressed. */
  passFromTurn?: number;
}

export const NO_LOCAL: LiveLocal = { autoPay: false, passingUntilYourTurn: false };

/** "To my turn" (pressed on turn `fromTurn`) is over once a later turn of yours has started. */
export function passUntilYourTurnDone(g: Pick<GameView, 'turn' | 'youId' | 'starting'>, fromTurn: number): boolean {
  return !g.starting && g.turn.activePlayerId === g.youId && g.turn.number > fromTurn;
}

export function toGameView(s: LiveSession, images: ImageLookup = scryfallLookup, local: LiveLocal = NO_LOCAL): GameView {
  const game = s.gameObject;
  const gp = game?.props ?? {};
  const playerIds = gp.Players ?? [];
  const viewer = s.viewer;
  const youNum = viewer && 'player' in viewer ? viewer.player : playerIds[0];
  const youIdx = Math.max(0, playerIds.indexOf(youNum ?? -1));
  const ordered = [...playerIds.slice(youIdx), ...playerIds.slice(0, youIdx)];
  const commander = gp.IsCommander === true || gp.GameType === 'Commander';
  const starting = !gp.Turn;

  const cards: Record<string, CardView> = {};
  for (const o of s.objects.values()) {
    if (o.type !== 'card') continue;
    const c = mapCard(s, o.id, images);
    if (c) cards[c.id] = c;
  }
  // The spell being paid for is in no zone: draw it from the copy kept when it left.
  if (s.lastCard !== undefined && !cards[sid(s.lastCard)] && s.limboCard(s.lastCard)) {
    const c = mapCard(s, s.lastCard, images);
    if (c) cards[c.id] = { ...c, zone: 'stack' };
  }
  // After a reload, the spell being cast as its targeting message names it: no objects, only its name.
  const named = s.castNamed;
  if (named && !cards[sid(named.id)] && youNum !== undefined) cards[sid(named.id)] = namedSpell(named, sid(youNum));
  const visible = (ids: number[] | undefined) => (ids ?? []).map(sid).filter((id) => cards[id]);
  const names = playerIds.map((id) => ({ id, name: s.get('player', id)?.props.Name ?? '' })).filter((x) => x.name);
  const mulligans = starting ? mulliganStates(s, names) : new Map<number, MulliganState>();
  const startingLife = (pid: number) => s.startingLife.get(pid) ?? (commander ? 40 : 20);

  const players: PlayerView[] = ordered.map((pid, seat) => {
    const p = s.get('player', pid)?.props ?? {};
    const isYou = pid === youNum;
    const cmdDamage = Object.entries(p.CommanderDamage ?? {}).map(([cid, amount]) => ({ commanderId: cid, amount }));
    const lostAt = s.lostAt.get(pid);
    const pv: PlayerView = {
      id: sid(pid),
      name: p.Name ?? `Player ${pid}`,
      seat,
      isYou,
      isAi: p.IsAI === true,
      life: p.Life ?? 0,
      startingLife: startingLife(pid),
      poison: p.Counters?.POISON ?? 0,
      counters: counters(p.Counters, ['POISON']),
      handCount: (p.Hand ?? []).length,
      libraryCount: (p.Library ?? []).length,
      hand: isYou ? visible(p.Hand) : [],
      battlefield: visible(p.Battlefield),
      graveyard: visible(p.Graveyard),
      exile: visible(p.Exile),
      command: visible(p.Command),
      commanders: visible(p.Commander),
      commanderCasts: Object.fromEntries(Object.entries(p.CommanderCast ?? {})),
      commanderDamageTaken: cmdDamage,
      landsPlayedThisTurn: p.NumLandThisTurn ?? 0,
      hasLost: p.HasLost === true,
    };
    if (pv.hasLost) {
      const reason: OutReason = isYou && s.conceded ? { kind: 'conceded' } : outReason(s, p, cards, gp.PoisonCountersToLose ?? 10);
      pv.out = { turn: lostAt ?? gp.Turn ?? 0, reason };
    }
    const pool = manaPool(p.Mana);
    if (pool) pv.manaPool = pool;
    if (starting && !pv.hasLost) pv.mulligan = mulligans.get(pid) ?? { state: 'deciding' };
    return pv;
  });

  // Every player id in the view names a player of the game (components look them up and throw otherwise).
  const activeId = gamePlayer(s, gp.PlayerTurn) ?? youNum ?? -1;

  // The engine lists the stack top first; the view-model wants bottom → top.
  const stack: StackItem[] = [...(gp.Stack ?? [])].reverse().flatMap((id): StackItem[] => {
    const si = s.get('stackItem', id)?.props;
    if (!si) return [];
    const targets: TargetRef[] = [
      ...(si.TargetCards ?? []).filter((c) => cards[sid(c)]).map((c): TargetRef => ({ kind: 'card', id: sid(c) })),
      ...(si.TargetPlayers ?? []).filter((p) => gamePlayer(s, p) !== undefined).map((p): TargetRef => ({ kind: 'player', id: sid(p) })),
      ...(si.TargetStackItems ?? []).filter((t) => gp.Stack?.includes(t)).map((t): TargetRef => ({ kind: 'stackItem', id: sid(t) })),
    ];
    const source = cards[sid(si.SourceCard ?? -1)];
    const controller = gamePlayer(s, si.ActivatingPlayer);
    return [
      {
        id: sid(id),
        sourceCardId: sid(si.SourceCard ?? -1),
        controllerId: controller !== undefined ? sid(controller) : (source?.controllerId ?? sid(activeId)),
        kind: si.Ability ? ((si.SourceTrigger ?? -1) >= 0 ? 'trigger' : 'ability') : 'spell',
        text: engineText(si.Description ?? ''),
        targets,
      },
    ];
  });

  const priority = playerIds.find((pid) => s.get('player', pid)?.props.HasPriority && !s.get('player', pid)?.props.HasLost);
  const combat: CombatState | undefined = gp.CombatView?.length
    ? {
        // Attackers, blockers and defenders the view can't draw (a merged mutate copy, id -1) are left out.
        // A planeswalker or battle attacked is named with its defending player (defendingPlayerOf).
        attacks: gp.CombatView.flatMap((band) => {
          const attackers = band.attackers.map(sid).filter((a) => cards[a]);
          if (band.defender.type === 'player') {
            const def = gamePlayer(s, band.defender.id);
            return def !== undefined ? attackers.map((a) => ({ attackerId: a, defenderId: sid(def) })) : [];
          }
          const card = cards[sid(band.defender.id)];
          return card ? attackers.map((a) => ({ attackerId: a, defenderId: defendingPlayerOf(card), defenderCardId: card.id })) : [];
        }),
        // plannedBlockers: the blocks as they stand, also while they are declared (blockers fills only once declared).
        blocks: gp.CombatView.flatMap((band) => {
          const attacker = band.attackers.map(sid).find((a) => cards[a]);
          const ids = [...new Set([...band.plannedBlockers, ...band.blockers])].map(sid).filter((b) => cards[b]);
          return attacker ? ids.map((b) => ({ blockerId: b, attackerId: attacker })) : [];
        }),
      }
    : undefined;

  // Your cards outside hand and command zone the engine says you may play now (actionable highlights).
  const youView = players.find((p) => p.isYou);
  if (youView && s.input.ok.label === 'OK' && !s.prompt) {
    const other = [...s.weakly.keys()]
      .map(sid)
      .filter((id) => cards[id] && cards[id]!.ownerId === youView.id && ['graveyard', 'exile', 'library'].includes(cards[id]!.zone));
    if (other.length) youView.otherZoneCasts = other.map((cardId) => ({ cardId, via: castVia(cards[cardId]!) }));
  }

  const youName = youView?.name;
  const base: Omit<GameView, 'decision'> = {
    id: `live-${s.game}`,
    format: commander ? 'commander' : 'constructed',
    youId: sid(youNum ?? -1),
    players,
    cards,
    stack,
    ...(starting ? { starting: true } : {}),
    turn: {
      number: gp.Turn ?? 0,
      activePlayerId: sid(activeId),
      step: STEP_OF[gp.Phase ?? 'UNTAP'] ?? 'untap',
      priorityPlayerId: priority !== undefined ? sid(priority) : undefined,
    },
    combat,
    autoPass: false,
    autoPay: local.autoPay,
    autoYield: false,
    autoYieldTo: [],
    passingUntilYourTurn: local.passingUntilYourTurn,
    // Step changes are the strip's job, not the log's.
    log: s.log.filter((e) => e.type !== 'PHASE').map((e): LogEntry => ({ id: `w${e.id}`, turn: e.turn, text: logText(e.msg, cards, youName) })),
  };
  const decision = decisionFor(s, base);
  const view: GameView = { ...base, decision };
  // The blocks you are declaring are the decision's draft only: drawn once, as a draft.
  if (decision.kind === 'declareBlockers' && view.combat) {
    const draft = decision.draft;
    view.combat = { ...view.combat, blocks: view.combat.blocks.filter((b) => !draft.some((x) => x.blockerId === b.blockerId && x.attackerId === b.attackerId)) };
  }
  // The engine's HasPriority can lag (it keeps the last holder through turn-based actions): your own input wins.
  if (decision.kind === 'priority') view.turn = { ...view.turn, priorityPlayerId: view.youId };
  else if (decision.kind !== 'waiting') view.turn = { ...view.turn, priorityPlayerId: undefined };
  if (s.finished) view.result = resultOf(s, view);
  return view;
}

function castVia(c: CardView): OtherZoneCastVia {
  // A foretold card is face down: its keywords are the face-down face's (none).
  if (c.faceDown?.foretold) return 'foretell';
  const k = c.keywords.map((x) => x.name.toLowerCase());
  if (k.includes('flashback')) return 'flashback';
  if (k.includes('escape')) return 'escape';
  if (k.includes('foretell')) return 'foretell';
  if (c.zone === 'exile' && /Adventure/.test(c.back?.typeLine ?? '')) return 'adventure';
  return 'other';
}

/** Winner: the one player still in; ranking: the winner, then the others by when they went out (last out first). */
function resultOf(s: LiveSession, g: GameView): GameResult {
  const inGame = g.players.filter((p) => !p.hasLost);
  const out = g.players
    .filter((p) => p.hasLost)
    .sort((a, b) => (s.lostOrder.get(Number(b.id)) ?? 0) - (s.lostOrder.get(Number(a.id)) ?? 0));
  const winnerId = inGame.length === 1 ? inGame[0]!.id : undefined;
  return {
    ...(winnerId ? { winnerId } : {}),
    reason: winnerId ? 'Last player standing.' : 'The game ended in a draw.',
    ranking: [...inGame.map((p) => p.id), ...out.map((p) => p.id)],
    nextGame: false,
  };
}
