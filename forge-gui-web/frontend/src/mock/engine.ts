/**
 * A fake engine: answers the player's intents with plausible state changes so
 * the mockup is clickable. It is deliberately shallow (no real mana, no real
 * rules). The real Forge engine replaces it behind the same Intent type.
 */
import type { Intent, PromptAnswer } from '../model/intents';
import { nextStep } from '../model/phases';
import {
  currentFace,
  isAura,
  isCreature,
  isInstantOrSorcery,
  isLand,
  manaValue,
  player,
  targetName,
} from '../model/selectors';
import type {
  CardId,
  CardKeyword,
  CardView,
  Decision,
  GameView,
  PlayerId,
  PlayerView,
  StackItem,
  TargetRef,
} from '../model/types';
import { lookup, type CardKey } from './cardDb';
import { producesMana, rule, type TargetSpec } from './cardRules';
import { keyword, printedKeywords } from './keywords';

export interface MockGame extends GameView {
  /** Effects that last until end of turn (Heroic Intervention, Run Amok…), by affected card. */
  eotEffects: Record<CardId, EotEffect[]>;
  /** Counter for new ids. */
  seq: number;
}

export interface EotEffect {
  sourceId: CardId;
  sourceName: string;
  power: number;
  toughness: number;
  keywords: string[];
}

const ref = (id: CardId) => `{card:${id}}`;

function log(g: MockGame, text: string, playerId?: PlayerId) {
  g.seq += 1;
  g.log.push({ id: `l${g.seq}`, turn: g.turn.number, playerId, text });
}

function zoneList(p: PlayerView, zone: CardView['zone']): CardId[] | undefined {
  switch (zone) {
    case 'hand':
      return p.hand;
    case 'battlefield':
      return p.battlefield;
    case 'graveyard':
      return p.graveyard;
    case 'exile':
      return p.exile;
    case 'command':
      return p.command;
    default:
      return undefined;
  }
}

function moveCard(g: MockGame, id: CardId, to: CardView['zone']) {
  const c = g.cards[id]!;
  const from = player(g, c.zone === 'battlefield' ? c.controllerId : c.ownerId);
  const list = zoneList(from, c.zone);
  if (list) list.splice(list.indexOf(id), 1);
  if (c.zone === 'hand') from.handCount = from.hand.length || Math.max(0, from.handCount - 1);
  // Leaving the battlefield: detach everything.
  if (c.zone === 'battlefield') {
    if (c.attachedTo) {
      const host = g.cards[c.attachedTo];
      if (host) host.attachments = host.attachments.filter((a) => a !== id);
      c.attachedTo = undefined;
    }
    for (const a of c.attachments) {
      const att = g.cards[a]!;
      att.attachedTo = undefined;
      if (isAura(att)) moveCard(g, a, 'graveyard');
    }
    c.attachments = [];
    c.tapped = false;
    c.damage = 0;
    c.counters = [];
    c.transformed = false;
    g.eotEffects[id] = [];
  }
  if (c.isToken && to !== 'battlefield') {
    // Tokens cease to exist outside the battlefield.
    g.cards = Object.fromEntries(Object.entries(g.cards).filter(([k]) => k !== id));
    return;
  }
  const owner = player(g, c.ownerId);
  c.zone = to;
  c.controllerId = to === 'battlefield' ? c.controllerId : c.ownerId;
  const dest = zoneList(to === 'battlefield' ? player(g, c.controllerId) : owner, to);
  dest?.push(id);
  if (to === 'hand') owner.handCount = owner.hand.length;
}

/** Recompute P/T and keywords from printed text, counters, attachments, anthems and end-of-turn effects. */
export function recompute(g: MockGame) {
  for (const c of Object.values(g.cards)) {
    if (c.zone !== 'battlefield') c.keywords = printedKeywords(currentFace(c).oracleText);
  }
  const onBf = g.players.flatMap((p) => p.battlefield.map((id) => g.cards[id]!));
  for (const c of onBf) {
    c.ptModifiers = [];
    c.keywords = printedKeywords(currentFace(c).oracleText);
    const grant = (labels: string[], source: CardView, untilEndOfTurn: boolean) => {
      for (const label of labels) {
        if (c.keywords.some((k) => k.label === label)) continue;
        const k: CardKeyword = { ...keyword(label), grantedBy: { cardId: source.id, name: source.name, untilEndOfTurn } };
        c.keywords.push(k);
      }
    };
    for (const a of c.attachments) {
      const bonus = rule(g.cards[a]!).attachBonus;
      if (!bonus) continue;
      if (bonus.power || bonus.toughness)
        c.ptModifiers.push({ source: g.cards[a]!.name, power: bonus.power, toughness: bonus.toughness });
      grant(bonus.keywords, g.cards[a]!, false);
    }
    for (const src of onBf) {
      const an = rule(src).anthem;
      if (!an || src.id === c.id || src.controllerId !== c.controllerId || !an.applies(c)) continue;
      if (an.power || an.toughness) c.ptModifiers.push({ source: src.name, power: an.power, toughness: an.toughness });
      grant(an.keywords, src, false);
    }
    for (const e of g.eotEffects[c.id] ?? []) {
      if (e.power || e.toughness) c.ptModifiers.push({ source: e.sourceName, power: e.power, toughness: e.toughness });
      grant(e.keywords, g.cards[e.sourceId] ?? ({ id: e.sourceId, name: e.sourceName } as CardView), true);
    }
    const plus = c.counters.find((x) => x.kind === '+1/+1');
    if (plus) c.ptModifiers.push({ source: `+1/+1 counters ×${plus.count}`, power: plus.count, toughness: plus.count });
    const face = currentFace(c);
    if (isCreature(c) && face.power !== undefined) {
      const bp = Number(face.power) || 0;
      const bt = Number(face.toughness) || 0;
      c.power = bp + c.ptModifiers.reduce((s, m) => s + m.power, 0);
      c.toughness = bt + c.ptModifiers.reduce((s, m) => s + m.toughness, 0);
    } else {
      c.power = undefined;
      c.toughness = undefined;
    }
  }
}

function hasKeyword(c: CardView, kw: string) {
  return c.keywords.some((k) => k.name === kw);
}

const COLOUR_SYMBOL: Record<string, string> = { white: 'W', blue: 'U', black: 'B', red: 'R', green: 'G' };

/** Hexproof, or "hexproof from <colour>" when `source` (an opponent's spell or ability) has that colour. */
function hexproofAgainst(c: CardView, source: CardView | undefined): boolean {
  return c.keywords.some((k) => {
    if (k.name !== 'Hexproof') return false;
    const from = /^Hexproof from (\w+)$/i.exec(k.label)?.[1];
    if (!from) return true;
    const symbol = COLOUR_SYMBOL[from.toLowerCase()];
    return !!symbol && !!source && new RegExp(`[{/]${symbol}[}/]`).test(currentFace(source).manaCost);
  });
}

function availableMana(g: MockGame, pid: PlayerId): number {
  return player(g, pid)
    .battlefield.map((id) => g.cards[id]!)
    .filter((c) => !c.tapped)
    .reduce((s, c) => s + producesMana(c), 0);
}

function payMana(g: MockGame, pid: PlayerId, amount: number) {
  let left = amount;
  const sources = player(g, pid)
    .battlefield.map((id) => g.cards[id]!)
    .filter((c) => !c.tapped && producesMana(c) > 0)
    .sort((a, b) => Number(isLand(b)) - Number(isLand(a)));
  for (const s of sources) {
    if (left <= 0) break;
    s.tapped = true;
    left -= producesMana(s);
  }
}

function castCost(g: MockGame, c: CardView): number {
  if (c.zone === 'graveyard') return manaValue(rule(c).flashback ?? c.front.manaCost);
  const base = manaValue(c.front.manaCost);
  if (c.zone === 'command') return base + 2 * (player(g, c.ownerId).commanderCasts[c.id] ?? 0);
  return base;
}

function canPlayLand(g: MockGame, c: CardView): boolean {
  const you = player(g, g.youId);
  const sorcerySpeed =
    g.turn.activePlayerId === g.youId && (g.turn.step === 'main1' || g.turn.step === 'main2') && g.stack.length === 0;
  const landFace = isLand(c) || (c.back !== undefined && /\bLand\b/.test(c.back.typeLine));
  return c.zone === 'hand' && landFace && sorcerySpeed && you.landsPlayedThisTurn === 0;
}

export function computePlayable(g: MockGame): CardId[] {
  const you = player(g, g.youId);
  const mana = availableMana(g, g.youId);
  const sorcerySpeed =
    g.turn.activePlayerId === g.youId && (g.turn.step === 'main1' || g.turn.step === 'main2') && g.stack.length === 0;
  const out: CardId[] = [];
  const candidates = [
    ...you.hand,
    ...you.command,
    ...you.graveyard.filter((id) => rule(g.cards[id]!).flashback),
  ].map((id) => g.cards[id]!);
  for (const c of candidates) {
    if (canPlayLand(g, c)) {
      out.push(c.id);
      continue;
    }
    if (isLand(c)) continue;
    const instantSpeed = /\bInstant\b/.test(c.front.typeLine) || rule(c).flash;
    if (!instantSpeed && !sorcerySpeed) continue;
    if (castCost(g, c) > mana) continue;
    const t = rule(c).target;
    if (t && legalTargets(g, t.spec, g.youId, c).length === 0) continue;
    out.push(c.id);
  }
  return out;
}

/** `source`: the card of the spell or ability, for "hexproof from <colour>". */
export function legalTargets(g: MockGame, spec: TargetSpec, casterId: PlayerId, source?: CardView): TargetRef[] {
  const all = g.players.flatMap((p) => p.battlefield.map((id) => g.cards[id]!));
  return all
    .filter((c) => {
      if (c.attachedTo && spec !== 'permanent' && spec !== 'nonlandPermanent') return false;
      if (c.controllerId !== casterId && hexproofAgainst(c, source)) return false;
      switch (spec) {
        case 'creature':
          return isCreature(c);
        case 'yourCreature':
          return isCreature(c) && c.controllerId === casterId;
        case 'nonlandPermanent':
          return !isLand(c);
        case 'permanent':
          return true;
      }
      return false;
    })
    .map((c) => ({ kind: 'card' as const, id: c.id }));
}

function priorityDecision(g: MockGame): Decision {
  return { kind: 'priority', playable: computePlayable(g) };
}

function newCard(g: MockGame, key: CardKey, ownerId: PlayerId, zone: CardView['zone'], token = false): CardView {
  g.seq += 1;
  const { front, back } = lookup(key);
  const c: CardView = {
    id: `${ownerId}-n${g.seq}`,
    name: front.name,
    front,
    back,
    ownerId,
    controllerId: ownerId,
    zone,
    isToken: token,
    isCommander: false,
    tapped: false,
    summoningSick: isCreature({ front } as CardView),
    counters: [],
    damage: 0,
    ptModifiers: [],
    keywords: [],
    attachments: [],
  };
  g.cards[c.id] = c;
  return c;
}

function castFromZone(g: MockGame, c: CardView, targets: TargetRef[]) {
  const you = player(g, c.ownerId);
  const fromZone = c.zone;
  payMana(g, c.ownerId, castCost(g, c));
  if (fromZone === 'command') you.commanderCasts[c.id] = (you.commanderCasts[c.id] ?? 0) + 1;
  const list = zoneList(you, fromZone)!;
  list.splice(list.indexOf(c.id), 1);
  if (fromZone === 'hand') you.handCount = you.hand.length;
  c.zone = 'stack';
  g.seq += 1;
  const item: StackItem = {
    id: `s${g.seq}`,
    sourceCardId: c.id,
    controllerId: c.ownerId,
    kind: 'spell',
    text: targets.length ? `${c.name} → ${targets.map((t) => targetName(g, t)).join(', ')}` : c.name,
    targets,
  };
  g.stack.push(item);
  const how = fromZone === 'graveyard' ? ' with flashback' : fromZone === 'command' ? ' from the command zone' : '';
  log(g, `You cast ${ref(c.id)}${how}${targets.length ? ` targeting ${targets.map((t) => (t.kind === 'card' ? ref(t.id) : targetName(g, t))).join(', ')}` : ''}.`, c.ownerId);
  // Sigil of the Empty Throne: enchantment spells make an Angel.
  const sigil = you.battlefield.map((id) => g.cards[id]!).find((x) => x.name === 'Sigil of the Empty Throne');
  if (sigil && /\bEnchantment\b/.test(c.front.typeLine)) {
    g.seq += 1;
    g.stack.push({
      id: `s${g.seq}`,
      sourceCardId: sigil.id,
      controllerId: you.id,
      kind: 'trigger',
      text: 'Sigil of the Empty Throne: create a 4/4 white Angel token with flying',
      targets: [],
    });
  }
}

function destroy(g: MockGame, id: CardId, verb = 'is destroyed') {
  const c = g.cards[id];
  if (!c) return;
  if (hasKeyword(c, 'Indestructible')) {
    log(g, `${ref(id)} is indestructible and survives.`);
    return;
  }
  log(g, `${ref(id)} ${verb}.`);
  moveCard(g, id, c.isCommander ? 'command' : 'graveyard');
}

function resolveTop(g: MockGame) {
  const item = g.stack.pop();
  if (!item) return;
  const src = g.cards[item.sourceCardId]!;
  const caster = player(g, item.controllerId);
  // Fizzle when every card target became illegal.
  const liveTargets = item.targets.filter((t) => {
    if (t.kind !== 'card') return true;
    const tc = g.cards[t.id];
    if (!tc || tc.zone !== 'battlefield') return false;
    return !(tc.controllerId !== item.controllerId && hexproofAgainst(tc, src));
  });
  if (item.targets.length > 0 && liveTargets.length === 0) {
    log(g, `${ref(src.id)} has no legal target left and does nothing.`, caster.id);
    if (src.zone === 'stack') moveCard2(g, src, 'graveyard');
    return;
  }
  const t = liveTargets[0];
  if (item.kind !== 'spell') {
    resolveAbility(g, item, src, t);
    return;
  }
  switch (src.name) {
    case 'Lightning Bolt':
      if (t?.kind === 'card') {
        const tc = g.cards[t.id]!;
        tc.damage += 3;
        log(g, `${ref(src.id)} deals 3 damage to ${ref(tc.id)}.`, caster.id);
        recompute(g);
        if (tc.toughness !== undefined && tc.damage >= tc.toughness) destroy(g, tc.id, 'dies');
      }
      break;
    case 'Swords to Plowshares':
    case 'Path to Exile':
      if (t?.kind === 'card') {
        const tc = g.cards[t.id]!;
        const ctrl = player(g, tc.controllerId);
        if (src.name === 'Swords to Plowshares') {
          ctrl.life += tc.power ?? 0;
          log(g, `${ref(tc.id)} is exiled; ${ctrl.name} gains ${tc.power ?? 0} life.`, caster.id);
        } else log(g, `${ref(tc.id)} is exiled; ${ctrl.name} may search for a basic land.`, caster.id);
        moveCard(g, tc.id, tc.isCommander ? 'command' : 'exile');
      }
      break;
    case 'Beast Within':
    case 'Generous Gift':
      if (t?.kind === 'card') destroy(g, t.id);
      break;
    case 'Heroic Intervention':
      for (const id of caster.battlefield) {
        const e = { sourceId: src.id, sourceName: src.name, power: 0, toughness: 0, keywords: ['Hexproof', 'Indestructible'] };
        g.eotEffects[id] = [...(g.eotEffects[id] ?? []), e];
      }
      log(g, `Your permanents gain hexproof and indestructible until end of turn.`, caster.id);
      break;
    case "Moment's Peace":
      log(g, `${ref(src.id)}: prevent all combat damage this turn.`, caster.id);
      break;
    case 'Cultivate':
      moveCard2(g, src, 'graveyard');
      g.decision = { kind: 'choice', prompt: cultivatePrompt(g, src.id) };
      return;
    default:
      if (!isInstantOrSorcery(src)) {
        moveCard2(g, src, 'battlefield');
        log(g, `${ref(src.id)} enters the battlefield.`, caster.id);
        return;
      }
      log(g, `${ref(src.id)} resolves.`, caster.id);
  }
  if (src.zone === 'stack') moveCard2(g, src, 'graveyard');
}

/** Abilities and triggers: the source stays where it is. */
function resolveAbility(g: MockGame, item: StackItem, src: CardView, t: TargetRef | undefined) {
  const caster = player(g, item.controllerId);
  switch (src.name) {
    case 'Sigil of the Empty Throne': {
      const angel = newCard(g, 'Angel token', caster.id, 'battlefield', true);
      caster.battlefield.push(angel.id);
      log(g, `${ref(src.id)} creates a 4/4 Angel token.`, caster.id);
      return;
    }
    case 'Goblin Bombardment':
      if (t?.kind === 'player') {
        const p = player(g, t.id);
        p.life -= 1;
        log(g, `${ref(src.id)} deals 1 damage to ${p.name}.`, caster.id);
      } else if (t?.kind === 'card') {
        const tc = g.cards[t.id]!;
        tc.damage += 1;
        log(g, `${ref(src.id)} deals 1 damage to ${ref(tc.id)}.`, caster.id);
        recompute(g);
        if (tc.toughness !== undefined && tc.damage >= tc.toughness) destroy(g, tc.id, 'dies');
      }
      return;
    default:
      log(g, `${ref(src.id)}: ${item.text}`, caster.id);
  }
}

/** Move a card that is on the stack (no zone list holds it). */
function moveCard2(g: MockGame, c: CardView, to: CardView['zone']) {
  c.zone = to;
  const p = player(g, to === 'battlefield' ? c.controllerId : c.ownerId);
  zoneList(p, to)?.push(c.id);
  if (to === 'battlefield' && isCreature(c)) c.summoningSick = true;
}

/** Cultivate's library search: the four basic land kinds, revealed to you as library cards. */
export function cultivatePrompt(g: MockGame, sourceCardId: CardId): import('../model/types').ChooseNPrompt {
  const kinds: [CardKey, number][] = [
    ['Forest', 9],
    ['Plains', 6],
    ['Snow-Covered Forest', 1],
    ['Snow-Covered Plains', 1],
  ];
  return {
    id: 'cultivate',
    shape: 'chooseN',
    title: 'Search your library',
    instruction: 'Choose up to two basic land cards. The first goes onto the battlefield tapped, the second into your hand.',
    sourceCardId,
    confirmLabel: 'Take these lands',
    min: 0,
    max: 2,
    options: kinds.map(([key, n]) => {
      const c = newCard(g, key, g.youId, 'library');
      return { id: c.id, label: c.name, cardId: c.id, detail: `${n} in library` };
    }),
  };
}

function afterPriorityChange(g: MockGame) {
  recompute(g);
  if (g.decision.kind === 'choice') return;
  g.turn.priorityPlayerId = g.youId;
  g.decision = priorityDecision(g);
}

function goToStep(g: MockGame, step: GameView['turn']['step']) {
  g.turn.step = step;
}

function resolveCombatDamage(g: MockGame) {
  const combat = g.combat;
  if (!combat) return;
  for (const a of combat.attacks) {
    const att = g.cards[a.attackerId];
    if (!att) continue;
    const blockers = combat.blocks.filter((b) => b.attackerId === a.attackerId).map((b) => g.cards[b.blockerId]!);
    if (blockers.length === 0) {
      const def = player(g, a.defenderId);
      const dmg = att.power ?? 0;
      def.life -= dmg;
      if (att.isCommander) {
        const cd = def.commanderDamageTaken.find((x) => x.commanderId === att.id);
        if (cd) cd.amount += dmg;
        else def.commanderDamageTaken.push({ commanderId: att.id, amount: dmg });
      }
      log(g, `${ref(att.id)} deals ${dmg} damage to ${def.name}.`, att.controllerId);
    } else {
      let left = att.power ?? 0;
      for (const b of blockers) {
        const dealt = Math.min(left, Math.max(0, (b.toughness ?? 0) - b.damage));
        b.damage += dealt;
        left -= dealt;
        att.damage += b.power ?? 0;
        log(g, `${ref(att.id)} and ${ref(b.id)} trade blows.`, att.controllerId);
      }
    }
  }
  recompute(g);
  for (const id of [...combat.attacks.map((a) => a.attackerId), ...combat.blocks.map((b) => b.blockerId)]) {
    const c = g.cards[id];
    if (c && c.zone === 'battlefield' && c.toughness !== undefined && c.damage >= c.toughness) destroy(g, id, 'dies');
  }
}

function answerPrompt(g: MockGame, answer: PromptAnswer) {
  if (g.decision.kind !== 'choice') return;
  const prompt = g.decision.prompt;
  const you = player(g, g.youId);
  if (answer.shape === 'order') {
    const top = answer.lists.find((l) => l.id === 'top')?.itemIds.length ?? 0;
    const bottom = answer.lists.find((l) => l.id === 'bottom')?.itemIds.length ?? 0;
    log(g, `You scry 2: ${top} on top, ${bottom} on the bottom.`, you.id);
  } else if (answer.shape === 'chooseN' && prompt.id === 'cultivate') {
    const [first, second] = answer.optionIds;
    if (first) {
      const land = g.cards[first]!;
      land.zone = 'battlefield';
      land.tapped = true;
      you.battlefield.push(land.id);
      log(g, `You put ${ref(land.id)} onto the battlefield tapped.`, you.id);
    }
    if (second) {
      const land = g.cards[second]!;
      land.zone = 'hand';
      you.hand.push(land.id);
      you.handCount = you.hand.length;
      log(g, `You put ${ref(land.id)} into your hand.`, you.id);
    }
    if (!first) log(g, 'You find no land.', you.id);
    you.libraryCount -= answer.optionIds.length;
  } else if (answer.shape === 'chooseN' && prompt.id.startsWith('face:')) {
    const cardId = prompt.id.slice(5);
    const c = g.cards[cardId]!;
    if (answer.optionIds[0] === 'land') {
      moveCard(g, cardId, 'battlefield');
      c.transformed = true;
      c.name = c.back!.name;
      c.tapped = true; // Emeria enters tapped unless you pay 3 life
      you.landsPlayedThisTurn += 1;
      log(g, `You play ${ref(cardId)}.`, you.id);
    } else {
      g.decision = { kind: 'priority', playable: [] };
      castFromZone(g, c, []);
    }
  } else if (answer.shape === 'yesNo') {
    log(g, `You choose ${answer.yes ? prompt.shape === 'yesNo' ? prompt.yesLabel : 'yes' : 'no'}.`, you.id);
  } else {
    log(g, `You answer: ${prompt.title}.`, you.id);
  }
  g.decision = { kind: 'priority', playable: [] };
  afterPriorityChange(g);
}

/** Apply one player intent. Returns a new game; the input is not mutated. */
export function applyIntent(prev: MockGame, intent: Intent): MockGame {
  const g = structuredClone(prev);
  const you = player(g, g.youId);
  const d = g.decision;

  switch (intent.type) {
    case 'play': {
      if (d.kind !== 'priority' || !d.playable.includes(intent.cardId)) return prev;
      const c = g.cards[intent.cardId]!;
      if (c.back && /\bLand\b/.test(c.back.typeLine) && c.zone === 'hand') {
        const canCast = castCost(g, c) <= availableMana(g, g.youId);
        g.decision = {
          kind: 'choice',
          prompt: {
            id: `face:${c.id}`,
            shape: 'chooseN',
            title: `Play ${c.front.name}`,
            instruction: 'This card has two faces. Choose how to play it.',
            sourceCardId: c.id,
            confirmLabel: 'Play',
            min: 1,
            max: 1,
            options: [
              ...(canCast
                ? [{ id: 'spell', label: `Cast ${c.front.name}`, detail: `${c.front.typeLine} · ${c.front.manaCost}` }]
                : []),
              { id: 'land', label: `Play ${c.back.name}`, detail: `${c.back.typeLine} · enters tapped` },
            ],
          },
        };
        return g;
      }
      if (isLand(c)) {
        moveCard(g, c.id, 'battlefield');
        you.landsPlayedThisTurn += 1;
        log(g, `You play ${ref(c.id)}.`, you.id);
        afterPriorityChange(g);
        return g;
      }
      const t = rule(c).target;
      if (t) {
        g.decision = {
          kind: 'chooseTargets',
          sourceCardId: c.id,
          instruction: t.instruction,
          legal: legalTargets(g, t.spec, g.youId, c),
          chosen: [],
          min: 1,
          max: 1,
        };
        return g;
      }
      castFromZone(g, c, []);
      afterPriorityChange(g);
      return g;
    }
    case 'toggleTarget': {
      if (d.kind !== 'chooseTargets') return prev;
      const same = (x: TargetRef) => x.kind === intent.target.kind && x.id === intent.target.id;
      if (!d.legal.some(same)) return prev;
      if (d.chosen.some(same)) d.chosen = d.chosen.filter((x) => !same(x));
      else d.chosen = d.max === 1 ? [intent.target] : [...d.chosen, intent.target].slice(0, d.max);
      return g;
    }
    case 'cancel': {
      if (d.kind === 'chooseTargets') {
        afterPriorityChange(g);
        return g;
      }
      if (d.kind === 'declareAttackers' || d.kind === 'declareBlockers') {
        d.draft = [];
        return g;
      }
      return prev;
    }
    case 'primary': {
      if (d.kind === 'chooseTargets') {
        if (d.chosen.length < d.min) return prev;
        castFromZone(g, g.cards[d.sourceCardId]!, d.chosen);
        afterPriorityChange(g);
        return g;
      }
      if (d.kind === 'priority') {
        if (g.stack.length > 0) {
          resolveTop(g);
          afterPriorityChange(g);
          return g;
        }
        if (g.turn.activePlayerId === g.youId && g.turn.step === 'main1') {
          goToStep(g, 'declareAttackers');
          const candidates = you.battlefield
            .map((id) => g.cards[id]!)
            .filter((c) => isCreature(c) && !c.tapped && (!c.summoningSick || hasKeyword(c, 'Haste')))
            .map((c) => c.id);
          const defenders = g.players.filter((p) => !p.isYou && !p.hasLost).map((p) => p.id);
          g.combat = { attacks: [], blocks: [] };
          g.decision = { kind: 'declareAttackers', candidates, defenders, draft: [] };
          log(g, 'You move to combat.', you.id);
          return g;
        }
        if (g.turn.activePlayerId === g.youId && g.turn.step === 'main2') {
          const next = g.players[1]!;
          goToStep(g, 'end');
          log(g, `You end your turn. ${next.name}'s turn begins.`, you.id);
          g.turn = { number: g.turn.number + 1, activePlayerId: next.id, step: 'upkeep', priorityPlayerId: next.id };
          g.eotEffects = {};
          recompute(g);
          g.decision = { kind: 'waiting', forPlayerId: next.id, what: `${next.name} is taking their turn` };
          return g;
        }
        log(g, 'You pass priority.', you.id);
        goToStep(g, nextStep(g.turn.step));
        afterPriorityChange(g);
        return g;
      }
      if (d.kind === 'declareAttackers') {
        g.combat = { attacks: d.draft, blocks: [] };
        for (const a of d.draft) {
          const c = g.cards[a.attackerId]!;
          if (!hasKeyword(c, 'Vigilance')) c.tapped = true;
        }
        if (d.draft.length === 0) {
          log(g, 'You skip your attack.', you.id);
          g.combat = undefined;
          goToStep(g, 'main2');
          afterPriorityChange(g);
          return g;
        }
        log(g, `You attack with ${d.draft.length}.`, you.id);
        goToStep(g, 'combatDamage');
        resolveCombatDamage(g);
        g.combat = undefined;
        goToStep(g, 'main2');
        afterPriorityChange(g);
        return g;
      }
      if (d.kind === 'declareBlockers') {
        g.combat = { attacks: g.combat?.attacks ?? [], blocks: d.draft };
        log(g, d.draft.length ? `You block with ${d.draft.length}.` : 'You declare no blocks.', you.id);
        goToStep(g, 'combatDamage');
        resolveCombatDamage(g);
        g.combat = undefined;
        goToStep(g, 'endCombat');
        const active = player(g, g.turn.activePlayerId);
        g.turn.priorityPlayerId = active.id;
        g.decision = { kind: 'waiting', forPlayerId: active.id, what: `${active.name} has priority after combat` };
        recompute(g);
        return g;
      }
      return prev;
    }
    case 'toggleAttacker': {
      if (d.kind !== 'declareAttackers' || !d.candidates.includes(intent.cardId)) return prev;
      const i = d.draft.findIndex((a) => a.attackerId === intent.cardId);
      if (i >= 0) d.draft.splice(i, 1);
      else d.draft.push({ attackerId: intent.cardId, defenderId: intent.defenderId });
      return g;
    }
    case 'setAttackDefender': {
      if (d.kind !== 'declareAttackers') return prev;
      const a = d.draft.find((x) => x.attackerId === intent.cardId);
      if (a) a.defenderId = intent.defenderId;
      return g;
    }
    case 'attackWithAll': {
      if (d.kind !== 'declareAttackers') return prev;
      d.draft = d.candidates.map((id) => ({ attackerId: id, defenderId: intent.defenderId }));
      return g;
    }
    case 'assignBlock': {
      if (d.kind !== 'declareBlockers') return prev;
      if (!d.candidates.includes(intent.blockerId) || !d.attackers.includes(intent.attackerId)) return prev;
      d.draft = d.draft.filter((b) => b.blockerId !== intent.blockerId);
      d.draft.push({ blockerId: intent.blockerId, attackerId: intent.attackerId });
      return g;
    }
    case 'removeBlock': {
      if (d.kind !== 'declareBlockers') return prev;
      d.draft = d.draft.filter((b) => b.blockerId !== intent.blockerId);
      return g;
    }
    case 'answer':
      answerPrompt(g, intent.answer);
      return g;
    case 'passUntilYourTurn':
      g.passingUntilYourTurn = true;
      log(g, 'You pass until your next turn. Stops still apply to the stack.', you.id);
      return g;
    case 'cancelPassUntilYourTurn':
      g.passingUntilYourTurn = false;
      return g;
    case 'setAutoPass':
      g.autoPass = intent.on;
      return g;
    case 'setAutoYield':
      g.autoYield = intent.on;
      return g;
    case 'toggleAutoYieldTo':
      g.autoYieldTo = g.autoYieldTo.includes(intent.key)
        ? g.autoYieldTo.filter((k) => k !== intent.key)
        : [...g.autoYieldTo, intent.key];
      return g;
    case 'undo':
      return prev; // handled by the store's history
  }
}
