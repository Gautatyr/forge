import { describe, expect, it } from 'vitest';
import type { CardView } from '../model/types';
import type { PromptChoice, PromptMessage } from './protocol';
import { inputToChoice, promptToChoice, promptWords, replyValue } from './prompts';
import { NO_INPUT } from './session';

const cards = { '12': { id: '12', name: 'Llanowar Elves' } as CardView };
const choices: PromptChoice[] = [
  { i: 0, label: 'Llanowar Elves', ref: { type: 'card', id: 12 } },
  { i: 1, label: 'Opponent', ref: { type: 'player', id: 1 } },
  { i: 2, label: 'Hidden card', ref: { type: 'card', id: 1073741900 } },
];
const base = { t: 'prompt' as const, id: 5 };
const choose = (method: PromptMessage['method'], min = 1, max = 1, extra: object = {}): PromptMessage => ({
  ...base,
  method,
  shape: 'choose',
  message: 'Choose a card',
  min,
  max,
  choices,
  ...extra,
});
const view = { players: [{ id: '0', isYou: true, hand: ['12', '13'] }], cards } as never;

describe('prompt → choice tray', () => {
  it('maps choose prompts to chooseN with the server bounds and card/player refs', () => {
    const p = promptToChoice(choose('chooseEntitiesForEffect', 1, 2), cards);
    expect(p).toMatchObject({ id: 'prompt:5', shape: 'chooseN', min: 1, max: 2, title: 'Choose a card' });
    expect(p.shape === 'chooseN' && p.options).toEqual([
      { id: '0', label: 'Llanowar Elves', cardId: '12' },
      { id: '1', label: 'Opponent', playerId: '1' },
      { id: '2', label: 'Hidden card' },
    ]);
    // A reveal (max 0): nothing to pick, OK.
    expect(promptToChoice(choose('getChoices', 0, 0), cards)).toMatchObject({ shape: 'chooseN', max: 0, confirmLabel: 'OK' });
  });

  it('maps getAbilityToPlay to the ability menu of its card, without the abilities that cannot be played', () => {
    const p = promptToChoice(
      choose('getAbilityToPlay', 0, 1, {
        message: null,
        card: { type: 'card', id: 12 },
        choices: [
          { i: 0, label: '{T}: Add {G}.' },
          { i: 1, label: '{1}: Pump', disabled: true },
        ],
      }),
      cards,
    );
    expect(p).toMatchObject({ shape: 'chooseN', abilityMenu: true, sourceCardId: '12', min: 0, max: 1 });
    expect(p.shape === 'chooseN' && p.options.map((o) => o.id)).toEqual(['0']);
  });

  it('maps a list of numbers to the number field', () => {
    const nums = ['0', '1', '2', '3'].map((label, i) => ({ i, label }));
    expect(promptToChoice(choose('getChoices', 1, 1, { choices: nums }), cards)).toMatchObject({ shape: 'input', kind: 'number', min: 0, max: 3 });
    expect(replyValue(choose('getChoices', 1, 1, { choices: nums }), { shape: 'input', value: '2' })).toEqual([2]);
  });

  it('never shows the same line as title and instruction', () => {
    // one line: the title alone
    expect(promptWords('Play first?', undefined, 'Confirm')).toEqual({ title: 'Play first?', instruction: '' });
    // what asks (no engine card id), then the rest
    expect(promptWords('Cultivate (12)\nSelect up to 2 cards from your library', undefined, 'Choose')).toEqual({
      title: 'Cultivate',
      instruction: 'Select up to 2 cards from your library',
    });
    // an engine title equal to the message
    expect(promptWords('Choose a colour', 'Choose a colour', 'Choose')).toEqual({ title: 'Choose a colour', instruction: '' });
    expect(promptWords('', undefined, 'Choose')).toEqual({ title: 'Choose', instruction: '' });
    // a long "Card: rule text" line: the card names the tray, the rule is the instruction
    const rule =
      'Szarekh, the Silent King: If a commander is in a graveyard or in exile and that card was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone.';
    expect(promptWords(rule, undefined, 'Confirm')).toEqual({
      title: 'Szarekh, the Silent King',
      instruction:
        'If a commander is in a graveyard or in exile and that card was put into that zone since the last time state-based actions were checked, its owner may put it into the command zone.',
    });
  });

  it('maps confirm to yes/no with the server labels and default', () => {
    const p: PromptMessage = { ...base, method: 'confirm', shape: 'confirm', message: 'Play first?', yes: 'Play', no: 'Draw', default: false };
    expect(promptToChoice(p, cards)).toMatchObject({ shape: 'yesNo', yesLabel: 'Play', noLabel: 'Draw', defaultAnswer: 'no', title: 'Play first?' });
    expect(replyValue(p, { shape: 'yesNo', yes: true })).toBe(true);
  });

  it('words engine confirmations for the player: no card ids, no stray dashes, zones not read as verbs', () => {
    const confirm = (message: string): PromptMessage => ({ ...base, method: 'confirm', shape: 'confirm', message, yes: 'Yes', no: 'No', default: true });
    expect(promptToChoice(confirm('Use triggered ability of Noxious Gearhulk (62)?\n\nTriggered by: Ruin Rat (247)'), cards)).toMatchObject({
      title: 'Use triggered ability of Noxious Gearhulk?',
      instruction: 'Triggered by: Ruin Rat',
    });
    expect(promptToChoice(confirm('Beseech the Mirror (65) -'), cards)).toMatchObject({ title: 'Beseech the Mirror', instruction: '' });
    expect(promptToChoice(confirm('Search your graveyard and exile?'), cards)).toMatchObject({ title: 'Look through your graveyard and exile zone?' });
  });

  it('words "X unless you Y" options as the cost to pay, the bare title as what happens otherwise (pass 2 #4)', () => {
    const torment = choose('getChoices', 1, 1, {
      message: 'Choose',
      choices: [
        { i: 0, label: 'You lose 3 life unless you sacrifice a nonland permanent.' },
        { i: 1, label: 'You lose 3 life unless you discard a card.' },
      ],
    });
    const p = promptToChoice(torment, cards);
    expect(p).toMatchObject({ title: 'Pay a cost, or lose 3 life', instruction: '' });
    expect(p.shape === 'chooseN' && p.options.map((o) => o.label)).toEqual(['Sacrifice a nonland permanent, or lose 3 life', 'Discard a card, or lose 3 life']);
    // replies stay indices
    expect(replyValue(torment, { shape: 'chooseN', optionIds: ['1'] })).toEqual([1]);
  });

  it('words three identical triggers apart in player words, no engine tags (issue #127)', () => {
    const vat = 'Whenever a nontoken creature dies, you may exile that card. [Zone Changer: ';
    const order: PromptMessage = {
      ...base,
      method: 'order',
      shape: 'order',
      message: 'Choose the order of the triggers',
      destLabel: 'Resolve first',
      choices: [
        { i: 0, label: `Mimic Vat (4) - ${vat}Boggart Brute (30)]`, inDest: false },
        { i: 1, label: `Mimic Vat (4) - ${vat}Rograkh, Son of Rohgahh (31)]`, inDest: false },
        { i: 2, label: `Mimic Vat (4) - ${vat}Face-down card (H0)]`, inDest: false },
        { i: 3, label: 'Mimic Vat (4) - At the beginning of your upkeep, draw. [Phase: You]', inDest: false },
      ],
      remainingMin: 0,
      remainingMax: 0,
      rememberOption: false,
    };
    const p = promptToChoice(order, cards);
    const labels = p.shape === 'order' ? p.lists.flatMap((l) => l.items.map((i) => i.label)) : [];
    expect(labels).toEqual([
      'Mimic Vat - Whenever a nontoken creature dies, you may exile that card. (for Boggart Brute)',
      'Mimic Vat - Whenever a nontoken creature dies, you may exile that card. (for Rograkh, Son of Rohgahh)',
      'Mimic Vat - Whenever a nontoken creature dies, you may exile that card. (for a face-down creature)',
      'Mimic Vat - At the beginning of your upkeep, draw.',
    ]);
    expect(labels.join(' ')).not.toMatch(/\[|\(H\d/);
  });

  it('shows a prompt title that is a whole ability text without its tag (issue #127)', () => {
    const text = 'When Necromancy enters, if it\'s on the battlefield, it becomes an Aura. Put target creature card from a graveyard onto the battlefield.';
    const line = `Necromancy (3) - ${text} [Zone Changer: Necromancy (3)]`;
    // as the prompt's title, or as its message: the card names the tray, the text is the instruction
    expect(promptWords('Select target creature card in a graveyard', line, 'Choose')).toEqual({
      title: 'Necromancy',
      instruction: `Select target creature card in a graveyard\n${text}`,
    });
    expect(promptWords(line, undefined, 'Choose')).toEqual({ title: 'Necromancy', instruction: text });
    // a short line stays whole
    expect(promptWords('Opt - Scry 1', undefined, 'Choose')).toEqual({ title: 'Opt - Scry 1', instruction: '' });
  });

  it('maps order to one list when everything must be ordered, two when some may stay out', () => {
    const order = (remainingMax: number): PromptMessage => ({
      ...base,
      method: 'order',
      shape: 'order',
      message: 'Order triggers',
      destLabel: 'Resolve first',
      choices: [
        { i: 0, label: 'A', inDest: false },
        { i: 1, label: 'B', inDest: true },
      ],
      remainingMin: 0,
      remainingMax,
      rememberOption: false,
    });
    const one = promptToChoice(order(0), cards);
    expect(one.shape === 'order' && one.lists.map((l) => [l.id, l.items.map((i) => i.id)])).toEqual([['dest', ['1', '0']]]);
    expect(replyValue(order(0), { shape: 'order', lists: [{ id: 'dest', itemIds: ['0', '1'] }] })).toEqual({ order: [0, 1], remember: false });
    const two = promptToChoice(order(1), cards);
    expect(two.shape === 'order' && two.lists.map((l) => [l.id, l.items.map((i) => i.id)])).toEqual([
      ['source', ['0']],
      ['dest', ['1']],
    ]);
  });

  it('maps a scry (manipulateCardList piles) to the top and bottom of the library and replies both piles', () => {
    const scried: PromptChoice[] = [
      { i: 0, label: 'Llanowar Elves', ref: { type: 'card', id: 12 } },
      { i: 1, label: 'Swamp', ref: { type: 'card', id: 13 } },
    ];
    const m: PromptMessage = {
      ...base,
      method: 'manipulateCardList',
      shape: 'order',
      message: 'Move cards to top or bottom of library',
      choices: scried,
      piles: true,
      toTop: true,
      toBottom: true,
      toAnywhere: false,
    };
    const p = promptToChoice(m, cards);
    expect(p).toMatchObject({ shape: 'order', title: 'Move cards to top or bottom of library' });
    expect(p.shape === 'order' && p.lists.map((l) => [l.id, l.label, l.items.map((i) => i.id)])).toEqual([
      ['top', 'Top of library', ['0', '1']],
      ['bottom', 'Bottom of library', []],
    ]);
    const answer = { shape: 'order' as const, lists: [{ id: 'top', itemIds: ['1'] }, { id: 'bottom', itemIds: ['0'] }] };
    expect(replyValue(m, answer)).toEqual({ top: [1], bottom: [0] });
    // bottom only (no engine caller today): one list, every card in it
    const bottomOnly = promptToChoice({ ...m, toTop: false }, cards);
    expect(bottomOnly.shape === 'order' && bottomOnly.lists.map((l) => [l.id, l.items.map((i) => i.id)])).toEqual([['bottom', ['0', '1']]]);
    expect(replyValue({ ...m, toTop: false }, { shape: 'order', lists: [{ id: 'bottom', itemIds: ['1', '0'] }] })).toEqual({ top: [], bottom: [1, 0] });
  });

  it('answers manipulateCardList with the full permutation and sideboard with the main deck', () => {
    const m: PromptMessage = { ...base, method: 'manipulateCardList', shape: 'order', message: 'Top of library', choices, permutation: true };
    const p = promptToChoice(m, cards);
    expect(p.shape === 'order' && p.lists.map((l) => l.id)).toEqual(['all']);
    expect(replyValue(m, { shape: 'order', lists: [{ id: 'all', itemIds: ['2', '0', '1'] }] })).toEqual([2, 0, 1]);
    const sb: PromptMessage = { ...base, method: 'sideboard', shape: 'order', message: 'Sideboard', destLabel: 'Main deck', choices: [{ i: 0, label: 'X', inDest: true }, { i: 1, label: 'Y' }] };
    expect(replyValue(sb, { shape: 'order', lists: [{ id: 'source', itemIds: ['0'] }, { id: 'dest', itemIds: ['1'] }] })).toEqual([1]);
  });

  it('maps combat damage to distribute with lethal and trample, and replies one amount per choice', () => {
    const d: PromptMessage = {
      ...base,
      method: 'assignCombatDamage',
      shape: 'distribute',
      card: { type: 'card', id: 12 },
      amount: 5,
      amountLabel: 'damage',
      atLeastOne: false,
      maySkip: false,
      lethalOrder: 'blockersFirst',
      choices: [
        { i: 0, label: 'Bear', ref: { type: 'card', id: 40 }, lethal: 2 },
        { i: 1, label: 'Opponent', ref: { type: 'player', id: 1 }, defender: true },
      ],
    };
    expect(promptToChoice(d, cards)).toMatchObject({
      shape: 'distribute',
      total: 5,
      sourceCardId: '12',
      combat: { attackerId: '12', deathtouch: false, trampleId: '1' },
      recipients: [{ id: '0', lethal: 2 }, { id: '1', playerId: '1' }],
    });
    expect(replyValue(d, { shape: 'distribute', amounts: { '0': 2, '1': 3 } })).toEqual([2, 3]);
    // an infect attacker (Blightsteel Colossus): the combat flag the player row's note reads
    const infectCards = { '12': { id: '12', name: 'Blightsteel Colossus', keywords: [{ name: 'Infect', label: 'Infect' }] } as CardView };
    expect(promptToChoice(d, infectCards)).toMatchObject({ combat: { attackerId: '12', infect: true } });
    expect(promptToChoice(d, cards)).toMatchObject({ combat: { infect: false } });
  });

  it('maps text: free text, number, a short option list, a card name', () => {
    const t = (extra: object): PromptMessage => ({ ...base, method: 'showInputDialog', shape: 'text', message: 'Name', numeric: false, ...extra });
    expect(promptToChoice(t({}), cards)).toMatchObject({ shape: 'input', kind: 'text' });
    expect(promptToChoice(t({ numeric: true, initial: '3' }), cards)).toMatchObject({ shape: 'input', kind: 'number', defaultValue: '3' });
    const few = t({ options: ['Red', 'Blue'] });
    expect(promptToChoice(few, cards)).toMatchObject({ shape: 'chooseN', min: 1, max: 1 });
    expect(replyValue(few, { shape: 'chooseN', optionIds: ['1'] })).toBe('Blue');
    const names = Array.from({ length: 20 }, (_, i) => `Card ${i}`);
    expect(promptToChoice(t({ options: names }), cards)).toMatchObject({ shape: 'input', kind: 'cardName' });
    expect(replyValue(t({ options: names }), { shape: 'input', value: 'Card 3' })).toBe('Card 3');
  });

  it('replies choose prompts with indices, never objects', () => {
    expect(replyValue(choose('getChoices', 0, 3), { shape: 'chooseN', optionIds: ['2', '0'] })).toEqual([2, 0]);
    expect(replyValue(choose('getAbilityToPlay', 0, 1), { shape: 'chooseN', optionIds: [] })).toEqual([]);
  });
});

describe('button inputs → tray', () => {
  it('turns Keep / Mulligan into the mulligan prompt', () => {
    const p = inputToChoice({ ...NO_INPUT, message: 'Keep?', ok: { label: 'Keep', enabled: true }, cancel: { label: 'Mulligan', enabled: true } }, view);
    expect(p?.id.startsWith('input:mulligan:')).toBe(true);
    expect(p).toMatchObject({ shape: 'yesNo' });
  });

  it('turns other two-button inputs into yes/no with the button labels', () => {
    const p = inputToChoice({ ...NO_INPUT, message: 'Use the ability?\nmore', ok: { label: 'Yes', enabled: true }, cancel: { label: 'No', enabled: true } }, view);
    expect(p).toMatchObject({ shape: 'yesNo', title: 'Use the ability?', instruction: 'more', yesLabel: 'Yes', noLabel: 'No' });
    expect(p?.id.startsWith('input:buttons:')).toBe(true);
  });

  it('words the two-player toss (Play / Draw) as who plays first (playtest 1)', () => {
    const duel = { players: [{ id: '0', isYou: true, hand: [] }, { id: '1', isYou: false, hasLost: false, hand: [] }], cards } as never;
    const msg = 'Hugo, you have won the coin toss.\n\nWould you like to play or draw?';
    const p = inputToChoice({ ...NO_INPUT, message: msg, ok: { label: 'Play', enabled: true }, cancel: { label: 'Draw', enabled: true } }, duel);
    expect(p).toMatchObject({
      shape: 'yesNo',
      title: 'You won the coin toss. Who plays first?',
      instruction: '',
      yesLabel: 'Play first',
      noLabel: 'Let {player:1} start',
    });
    expect(p?.id.startsWith('input:buttons:')).toBe(true);
  });

  it('turns the London mulligan bottom step into a pick from your hand', () => {
    const p = inputToChoice({ ...NO_INPUT, message: 'Return 1 card(s) to the bottom of your library', ok: { label: 'OK', enabled: false }, cancel: { label: 'Auto', enabled: true } }, view);
    expect(p?.id.startsWith('input:bottom:1:')).toBe(true);
    expect(p).toMatchObject({ shape: 'chooseN', min: 1, max: 1 });
  });
});
