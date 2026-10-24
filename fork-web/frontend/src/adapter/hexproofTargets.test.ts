/**
 * Issue #175: the page offers exactly the cards the engine's targeting input names (InputSelectTargets uses
 * Card.canBeTargetedBy): an opponent's hexproof creature is not offered, dimmed like any non-target; the seat's own
 * hexproof creature is. A click on a card that is not offered still goes to the engine, which refuses it with a note.
 */
import { describe, expect, it } from 'vitest';
import { cardStatus } from '../state/cardStatus';
import { INITIAL_UI } from '../state/ui';
import type { CallMessage, WireObject } from '../wire/generated/wire';
import { intentToFrames } from './commands';
import { LiveSession } from './session';
import { toGameView } from './toView';

const YOU = { type: 'player', id: 0 } as const;
const card = (id: number) => ({ type: 'card', id }) as const;

const cardObjs = (id: number, owner: number, zone: string, name: string, type: string): WireObject[] => [
  { type: 'card', id, props: { Owner: owner, Controller: owner, Zone: zone, CurrentState: 'Original' } } as WireObject,
  { type: 'cardState', id, state: 'Original', props: { Name: name, Type: type } } as WireObject,
];

/** Swords to Plowshares is being cast; the engine offers the opponent's Bears (60) and your own hexproof Scout (62), not their Scout (61). */
function targeting(): LiveSession {
  const objects: WireObject[] = [
    { type: 'game', id: 1, props: { Players: [0, 1], Turn: 3, Phase: 'MAIN1', PlayerTurn: 0, GameType: 'Constructed', Stack: [] } },
    { type: 'player', id: 0, props: { Name: 'Hugo', Life: 20, Hand: [50], Battlefield: [62] } },
    { type: 'player', id: 1, props: { Name: 'AI', IsAI: true, Life: 20, Battlefield: [60, 61] } },
    ...cardObjs(50, 0, 'Hand', 'Swords to Plowshares', 'Instant'),
    ...cardObjs(60, 1, 'Battlefield', 'Grizzly Bears', 'Creature - Bear'),
    ...cardObjs(61, 1, 'Battlefield', 'Gladecover Scout', 'Creature - Elf Scout'),
    ...cardObjs(62, 0, 'Battlefield', 'Gladecover Scout', 'Creature - Elf Scout'),
  ];
  const s = new LiveSession();
  s.apply({ t: 'snapshot', game: 1, seq: 0, label: 't', viewer: { seat: 0, player: 0 }, objects, log: [] });
  s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'End Turn', true, true, true] });
  s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Priority: Hugo', null] });
  s.clicked(50);
  const sel: CallMessage = {
    t: 'call',
    method: 'setSelection',
    args: [{ kind: 'Selection', cards: [card(60), card(62)], min: 1, max: 1, targets: [], chosen: [] }],
  };
  s.apply(sel);
  s.apply({ t: 'call', method: 'showPromptMessage', args: [YOU, 'Swords to Plowshares (50) - Exile target creature.\n\nSelect target creature', card(-1)] });
  s.apply({ t: 'call', method: 'updateButtons', args: [YOU, 'OK', 'Cancel', false, true, true] });
  return s;
}

describe('targets the engine does not offer', () => {
  it("offers the legal creatures only: not the opponent's hexproof one, the seat's own hexproof one yes", () => {
    const g = toGameView(targeting());
    expect(g.decision).toMatchObject({
      kind: 'chooseTargets',
      legal: [
        { kind: 'card', id: '60' },
        { kind: 'card', id: '62' },
      ],
    });
  });

  it("rings the offered creatures and dims the opponent's hexproof one", () => {
    const g = toGameView(targeting());
    expect(cardStatus(g, INITIAL_UI, '60')).toMatchObject({ actionable: true, actionKind: 'target', dimmed: false });
    expect(cardStatus(g, INITIAL_UI, '62')).toMatchObject({ actionable: true, actionKind: 'target' });
    expect(cardStatus(g, INITIAL_UI, '61')).toMatchObject({ actionable: false, dimmed: true });
    expect(cardStatus(g, INITIAL_UI, '61').actionKind).toBeUndefined();
  });

  it("the opponent's hexproof one shows no pointer cursor (inert), the offered ones do (#180)", () => {
    const g = toGameView(targeting());
    expect(cardStatus(g, INITIAL_UI, '61').inert).toBe(true);
    expect(cardStatus(g, INITIAL_UI, '60').inert).toBe(false);
    expect(cardStatus(g, INITIAL_UI, '62').inert).toBe(false);
  });

  it('still sends a click on it, for the engine to refuse (it names the reason)', () => {
    const s = targeting();
    const g = toGameView(s);
    expect(intentToFrames({ type: 'toggleTarget', target: { kind: 'card', id: '61' } }, s, g)).toEqual([{ t: 'action', method: 'selectCard', card: 61 }]);
  });
});
