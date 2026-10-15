/**
 * Wire state → UI view-model (src/model/types.ts). Pure: reads a LiveSession, returns a GameView.
 * Ids become strings; hidden cards (no cardState for this viewer) stay out of `cards`, so zone
 * lists name only cards the components can draw (opponents' hands become a count).
 */
import type {
  CardView,
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
} from '../model/types';
import type { CardProps, CardStateProps, PhaseType, ZoneType } from '../wire/generated/wire';
import { namedImage, parseImageKey, type ImageLookup } from './images';
import { promptToChoice, inputToChoice } from './prompts';
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

/** `c:<name>|<set>|<art index>` → an image by name and set (the view has no collector number); other keys (tokens…) have none. */
export function imageFromKey(key: string | undefined, back = false, lookup: ImageLookup = namedImage): CardFace['image'] {
  const r = parseImageKey(key);
  return r ? lookup({ ...r, back }) : undefined;
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
    image: imageFromKey(p.ImageKey, back, images),
  };
  if (creature) {
    f.power = String(p.Power ?? 0);
    f.toughness = String(p.Toughness ?? 0);
  }
  if (/\bPlaneswalker\b/.test(type) && p.Loyalty) f.loyalty = p.Loyalty;
  return f;
}

const sid = (n: number) => String(n);

export function mapCard(s: LiveSession, id: number, images: ImageLookup = namedImage): CardView | undefined {
  const card = s.get('card', id);
  if (!card) return undefined;
  const cp: CardProps = card.props;
  const current = cp.CurrentState ?? 'Original';
  const cur = s.cardState(id, current);
  if (!cur) return undefined; // hidden from this viewer
  const original = current === 'Original' ? cur : s.cardState(id, 'Original');
  const alt = cp.AlternateState ? s.cardState(id, cp.AlternateState) : undefined;
  const frontState = original ?? cur;
  const backState = current !== 'Original' && original ? cur : alt;
  const faceDown = current === 'FaceDown';
  const name = faceDown ? cur.props.Name || 'Face-down card' : cp.Name || cur.props.Name || '?';
  const front = face(frontState.props, name, false, images);
  const back = backState && backState !== frontState ? face(backState.props, name, true, images) : undefined;
  const transformed = backState === cur && back !== undefined;
  const zone = (cp.Zone && ZONE_OF[cp.Zone]) || 'exile';
  const creature = /\bCreature\b/.test(typeLineOf(cur.props.Type));
  const attached = cp.EntityAttachedTo;
  return {
    id: sid(id),
    name,
    front,
    back,
    transformed,
    ownerId: sid(cp.Owner ?? -1),
    controllerId: sid(cp.Controller ?? cp.Owner ?? -1),
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
  };
}

/** Log text with "Name (id)" turned into {card:id} tokens for cards this viewer can see. */
export function logText(text: string, cards: Record<string, CardView>): string {
  let out = '';
  let last = 0;
  for (const m of text.matchAll(/ \((\d+)\)/g)) {
    const c = cards[m[1]!];
    const before = text.slice(last, m.index);
    const name = c ? [c.name, c.front.name, c.back?.name].find((n) => n && before.endsWith(n)) : undefined;
    out += name ? `${before.slice(0, before.length - name.length)}{card:${c!.id}}` : before + m[0];
    last = m.index + m[0].length;
  }
  return out + text.slice(last);
}

function decisionFor(s: LiveSession, view: Omit<GameView, 'decision'>): Decision {
  const you = Number(view.youId);
  if (s.prompt) return { kind: 'choice', prompt: promptToChoice(s.prompt, view.cards) };
  const input = s.input;
  const forYou =
    input.ownerId === you && (input.ok.enabled || input.cancel.enabled || !!input.selectable || input.targets.length > 0);
  if (!forYou) {
    const holder = view.turn.priorityPlayerId ?? view.turn.activePlayerId;
    const who = view.players.find((p) => p.id === holder);
    if (s.finished) return { kind: 'waiting', forPlayerId: holder, what: 'Game over' };
    return { kind: 'waiting', forPlayerId: holder, what: who ? `${who.name} has priority` : 'Waiting' };
  }
  const youView = view.players.find((p) => p.isYou)!;
  const yourCreatures = youView.battlefield.filter((id) => view.cards[id]?.power !== undefined && !view.cards[id]?.tapped);
  const combat = view.combat ?? { attacks: [], blocks: [] };
  if (view.turn.step === 'declareAttackers' && view.turn.activePlayerId === view.youId && /attack/i.test(input.message) && !s.input.selectable) {
    return {
      kind: 'declareAttackers',
      candidates: yourCreatures,
      defenders: view.players.filter((p) => !p.isYou && !p.hasLost).map((p) => p.id),
      draft: combat.attacks,
    };
  }
  if (view.turn.step === 'declareBlockers' && view.turn.activePlayerId !== view.youId && /block/i.test(input.message) && !s.input.selectable) {
    const attackingYou = combat.attacks.filter((a) => a.defenderId === view.youId).map((a) => a.attackerId);
    return { kind: 'declareBlockers', candidates: yourCreatures, attackers: attackingYou, draft: combat.blocks };
  }
  if (input.selectable || input.targets.length > 0) {
    const legal: TargetRef[] = [
      ...(input.selectable?.cards ?? []).filter((id) => view.cards[sid(id)]).map((id): TargetRef => ({ kind: 'card', id: sid(id) })),
      ...input.targets.filter((t) => t.type === 'player').map((t): TargetRef => ({ kind: 'player', id: sid(t.id) })),
    ];
    const chosen: TargetRef[] = input.highlighted.flatMap((h): TargetRef[] =>
      h.type === 'card' ? [{ kind: 'card', id: sid(h.id) }] : h.type === 'player' ? [{ kind: 'player', id: sid(h.id) }] : [],
    );
    return {
      kind: 'chooseTargets',
      sourceCardId: input.cardId !== undefined ? sid(input.cardId) : '',
      instruction: input.message.trim() || 'Choose',
      legal,
      chosen,
      min: input.selectable?.min ?? 0,
      max: input.selectable?.max ?? 1,
    };
  }
  // InputPassPriority: OK + End Turn / Undo. Anything else (mulligan, pay mana, confirm…) is a two-button choice.
  if (input.ok.label === 'OK' && /^(End Turn|Undo)/.test(input.cancel.label)) return { kind: 'priority', playable: [] };
  return { kind: 'choice', prompt: inputToChoice(input) };
}

export function toGameView(s: LiveSession, images: ImageLookup = namedImage): GameView {
  const game = s.gameObject;
  const gp = game?.props ?? {};
  const playerIds = gp.Players ?? [];
  const viewer = s.viewer;
  const youNum = viewer && 'player' in viewer ? viewer.player : playerIds[0];
  const youIdx = Math.max(0, playerIds.indexOf(youNum ?? -1));
  const ordered = [...playerIds.slice(youIdx), ...playerIds.slice(0, youIdx)];
  const commander = gp.IsCommander === true || gp.GameType === 'Commander';

  const cards: Record<string, CardView> = {};
  for (const o of s.objects.values()) {
    if (o.type !== 'card') continue;
    const c = mapCard(s, o.id, images);
    if (c) cards[c.id] = c;
  }
  const visible = (ids: number[] | undefined) => (ids ?? []).map(sid).filter((id) => cards[id]);

  const players: PlayerView[] = ordered.map((pid, seat) => {
    const p = s.get('player', pid)?.props ?? {};
    const isYou = pid === youNum;
    const cmdDamage = Object.entries(p.CommanderDamage ?? {}).map(([cid, amount]) => ({ commanderId: cid, amount }));
    return {
      id: sid(pid),
      name: p.Name ?? `Player ${pid}`,
      seat,
      isYou,
      isAi: p.IsAI === true,
      life: p.Life ?? 0,
      startingLife: commander ? 40 : 20,
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
  });

  // The engine lists the stack top first; the view-model wants bottom → top.
  const stack: StackItem[] = [...(gp.Stack ?? [])].reverse().flatMap((id): StackItem[] => {
    const si = s.get('stackItem', id)?.props;
    if (!si) return [];
    const targets: TargetRef[] = [
      ...(si.TargetCards ?? []).filter((c) => cards[sid(c)]).map((c): TargetRef => ({ kind: 'card', id: sid(c) })),
      ...(si.TargetPlayers ?? []).map((p): TargetRef => ({ kind: 'player', id: sid(p) })),
    ];
    return [
      {
        id: sid(id),
        sourceCardId: sid(si.SourceCard ?? -1),
        controllerId: sid(si.ActivatingPlayer ?? -1),
        kind: si.Ability ? ((si.SourceTrigger ?? -1) >= 0 ? 'trigger' : 'ability') : 'spell',
        text: si.Description ?? '',
        targets,
      },
    ];
  });

  const priority = playerIds.find((pid) => s.get('player', pid)?.props.HasPriority);
  const combat: CombatState | undefined = gp.CombatView?.length
    ? {
        attacks: gp.CombatView.flatMap((band) => {
          const def = band.defender.type === 'player' ? sid(band.defender.id) : cards[sid(band.defender.id)]?.controllerId;
          return def ? band.attackers.map((a) => ({ attackerId: sid(a), defenderId: def })) : [];
        }),
        blocks: gp.CombatView.flatMap((band) =>
          band.attackers.length ? band.blockers.map((b) => ({ blockerId: sid(b), attackerId: sid(band.attackers[0]!) })) : [],
        ),
      }
    : undefined;

  const base: Omit<GameView, 'decision'> = {
    id: `live-${s.game}`,
    format: commander ? 'commander' : 'constructed',
    youId: sid(youNum ?? -1),
    players,
    cards,
    stack,
    turn: {
      number: gp.Turn ?? 0,
      activePlayerId: sid(gp.PlayerTurn ?? youNum ?? -1),
      step: STEP_OF[gp.Phase ?? 'UNTAP'] ?? 'untap',
      priorityPlayerId: priority !== undefined ? sid(priority) : undefined,
    },
    combat,
    autoPass: false,
    autoYield: false,
    autoYieldTo: [],
    passingUntilYourTurn: false,
    log: s.log.map((e): LogEntry => ({ id: `w${e.id}`, turn: e.turn, text: logText(e.msg, cards) })),
  };
  return { ...base, decision: decisionFor(s, base) };
}
