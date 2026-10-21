import { describe, expect, it } from 'vitest';
import {
  PROPERTY_KINDS,
  PROTOCOL_METHODS,
  WIRE_VERSION,
  type ClientProtocolArgs,
  type DeltaMessage,
  type ServerMessage,
  type SnapshotMessage,
  type WireObject,
} from './generated/wire';
import { hasDrift, schemaDrift } from './schemaDrift';

// Shapes from docs/fork/architecture/spike-report.md "Wire format (v1)" + web-ui.md wire v2; `satisfies` makes tsc check them.
const snapshot = {
  t: 'snapshot',
  game: 1,
  seq: 0,
  label: 'game',
  viewer: { seat: 0, player: 1 },
  objects: [
    { type: 'game', id: 1, props: { Players: [1, 2], Turn: 3, Phase: 'MAIN1', PlayerTurn: 1 } },
    { type: 'player', id: 1, props: { Life: 18, Battlefield: [10], Hand: [11], Counters: { POISON: 1 } } },
    { type: 'card', id: 10, props: { Zone: 'Battlefield', Owner: 1, Controller: 1, Tapped: true, CurrentState: 'Original' } },
    { type: 'card', id: 11, props: { Zone: 'Hand', Owner: 1, Controller: 1 } },
    { type: 'cardState', id: 10, state: 'Original', props: { Name: 'Grizzly Bears', Power: 2, Toughness: 2, ManaCost: '{1}{G}' } },
  ],
  log: [{ type: 'ZONE_CHANGE', msg: 'Grizzly Bears enters the battlefield.' }],
} satisfies SnapshotMessage;

const delta = {
  t: 'delta',
  game: 1,
  seq: 1,
  ts: 1760000000000,
  new: [],
  changed: [
    { type: 'player', id: 1, props: { Life: null } },
    { type: 'card', id: 10, props: { EntityAttachedTo: { type: 'player', id: 2 }, Tapped: false } },
  ],
  removed: ['card:11', 'cardState:11:Original'],
  log: [],
  events: ['CardTapped'],
  final: true,
} satisfies DeltaMessage;

describe('generated wire types', () => {
  it('describe the v2 messages', () => {
    const messages: ServerMessage[] = [snapshot, delta];
    expect(messages.map((m) => m.t)).toEqual(['snapshot', 'delta']);
    expect(WIRE_VERSION).toBe(2);
  });

  it('reject properties of another object type and wrong value types', () => {
    // @ts-expect-error -- Life is a player property, not a card property
    const lifeOnCard: WireObject = { type: 'card', id: 1, props: { Life: 20 } };
    // @ts-expect-error -- Zone is a ZoneType name
    const badZone: WireObject = { type: 'card', id: 1, props: { Zone: 'Moon' } };
    // @ts-expect-error -- reorderHand takes a card id and an index
    const badArgs: ClientProtocolArgs['reorderHand'] = [1];
    expect([lifeOnCard, badZone, badArgs]).toHaveLength(3);
  });

  it('list every protocol method with its direction', () => {
    expect(PROTOCOL_METHODS.selectCard).toBe('client');
    expect(PROTOCOL_METHODS.getChoices).toBe('server');
  });
});

describe('schemaDrift', () => {
  const same: Record<string, string> = { ...PROPERTY_KINDS };

  it('finds nothing when the server runs the engine the types came from', () => {
    expect(hasDrift(schemaDrift(same))).toBe(false);
  });

  it('reports missing, unknown and re-kinded properties', () => {
    const runtime: Record<string, string> = { ...same, Life: 'string', NewUpstreamProp: 'int' };
    delete runtime.Tapped;
    expect(schemaDrift(runtime)).toEqual({
      missing: ['Tapped'],
      unknown: ['NewUpstreamProp'],
      changed: [{ name: 'Life', built: 'int', runtime: 'string' }],
    });
  });
});
