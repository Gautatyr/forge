#!/usr/bin/env node
// Resolves the mock scenarios' card names to Scryfall data once, and writes
// src/mock/scryfall-cards.json. Run with `pnpm resolve-cards` when the card
// list changes. At runtime the app only loads images from cards.scryfall.io.
//
// Scryfall asks for a descriptive User-Agent and rate-limits the card
// endpoints (https://scryfall.com/docs/api). Named cards go through one
// /cards/collection POST per 75 names; tokens need one search each. Requests
// are spaced DELAY_MS apart and a 429 backs off and retries.
import { writeFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const OUT = join(dirname(fileURLToPath(import.meta.url)), '../src/mock/scryfall-cards.json');
const DELAY_MS = 600;
const HEADERS = {
  'User-Agent': 'ForgeForkMatchMockup/0.1 (+https://github.com/Gautatyr/forge)',
  Accept: 'application/json',
};

/** Plain names resolve with /cards/named?exact=. Tokens need a search query. */
const CARDS = [
  // You: Sythis enchantress (G/W)
  "Sythis, Harvest's Hand", 'Swiftfoot Boots', 'Eidolon of Blossoms', 'Knight of Autumn', 'Rancor',
  'Selfless Spirit', 'Elvish Mystic', 'Setessan Champion', 'Sigil of the Empty Throne',
  'Forest', 'Plains', 'Temple Garden', 'Command Tower', 'Krosan Verge', 'Temple of Plenty',
  'Path to Exile', 'Heroic Intervention', "Enchantress's Presence", 'Beast Within', 'Cultivate',
  'Smothering Tithe', "Emeria's Call", 'Sanctum Weaver', "Mirari's Wake", 'Generous Gift',
  'Destiny Spinner', 'Doubling Season', 'Swords to Plowshares', "Moment's Peace", 'Wrath of God',
  'Llanowar Elves', 'Mesa Enchantress', 'Snow-Covered Forest', 'Snow-Covered Plains',
  // Mira: Krenko goblins (R)
  'Krenko, Mob Boss', 'Goblin Bombardment', 'Impact Tremors', 'Skirk Prospector', 'Goblin Chieftain',
  'Mountain', 'Sol Ring', 'Lightning Bolt', 'Goblin Guide', 'Goblin Matron',
  // Theo: Talrand spells (U)
  'Talrand, Sky Summoner', 'Rhystic Study', 'Arcane Signet', 'Island', 'Mystic Sanctuary',
  'Search for Azcanta', 'Counterspell', 'Brainstorm', 'Ponder',
  // Ana: Meren aristocrats (B/G)
  'Meren of Clan Nel Toth', 'Sakura-Tribe Elder', 'Eternal Witness', 'Phyrexian Arena', 'Swamp',
  'Overgrown Tomb', 'Viscera Seer', 'Fleshbag Marauder', 'Plaguecrafter',
  // 1v1
  'Steel Leaf Champion', 'Questing Beast', 'Old-Growth Troll', 'Ram Through', 'Primeval Titan',
  'Monastery Swiftspear', 'Eidolon of the Great Revel', 'Heartfire Hero', 'Bonecrusher Giant',
  // Keyword icons (pass 3): Commander table additions and the `keywords` scenario
  'Vampire Nighthawk', 'Tolarian Terror', 'Run Amok', 'Fencing Ace', 'Giant Spider', 'Wall of Omens',
  'Noble Hierarch', 'Avacyn, Angel of Hope', 'Silver Knight', 'Knight of Grace', "Ulamog's Crusher",
  'Bloated Contaminator', 'Boggart Brute',
  // Payment (pass 4): an X spell
  "Green Sun's Zenith",
  // Tokens
  { key: 'Angel token', query: '!"Angel" t:token pow=4 tou=4 o:flying c=w' },
  { key: 'Goblin token', query: '!"Goblin" t:token pow=1 tou=1 c=r' },
  { key: 'Drake token', query: '!"Drake" t:token pow=2 tou=2 c=u' },
];

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function getJson(url, init = {}) {
  for (let attempt = 0; attempt < 4; attempt++) {
    await sleep(DELAY_MS);
    const res = await fetch(url, { ...init, headers: { ...HEADERS, ...(init.headers ?? {}) } });
    if (res.status === 429) {
      const wait = Number(res.headers.get('retry-after') ?? 0) * 1000 || 5000 * (attempt + 1);
      process.stdout.write(`429, waiting ${wait} ms\n`);
      await sleep(wait);
      continue;
    }
    if (!res.ok) throw new Error(`${res.status} ${url}`);
    return res.json();
  }
  throw new Error(`rate-limited: ${url}`);
}

function face(f) {
  return {
    name: f.name,
    manaCost: f.mana_cost ?? '',
    typeLine: f.type_line ?? '',
    oracleText: f.oracle_text ?? '',
    power: f.power,
    toughness: f.toughness,
    loyalty: f.loyalty,
    image: f.image_uris ? { normal: f.image_uris.normal, large: f.image_uris.large } : undefined,
  };
}

function toEntry(key, c) {
  const faces = c.card_faces ?? [];
  const twoImaged = faces.length === 2 && faces[0].image_uris; // transform / MDFC
  const front = twoImaged ? face(faces[0]) : face({ ...c, ...(faces[0] ?? {}), image_uris: c.image_uris });
  if (!twoImaged && faces.length === 2) {
    // split/adventure: one image, combined text
    front.name = c.name;
    front.oracleText = faces.map((f) => `${f.name}: ${f.oracle_text}`).join('\n\n');
    front.manaCost = c.mana_cost ?? faces[0].mana_cost;
    front.typeLine = c.type_line;
  }
  return {
    key,
    scryfallId: c.id,
    set: c.set,
    collectorNumber: c.collector_number,
    artist: c.artist,
    layout: c.layout,
    colors: c.colors ?? faces[0]?.colors ?? [],
    front,
    back: twoImaged ? face(faces[1]) : undefined,
  };
}

const out = {};
const names = CARDS.filter((c) => typeof c === 'string');
for (let i = 0; i < names.length; i += 75) {
  const batch = names.slice(i, i + 75);
  const res = await getJson('https://api.scryfall.com/cards/collection', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ identifiers: batch.map((name) => ({ name })) }),
  });
  for (const nf of res.not_found ?? []) {
    process.stdout.write(`FAIL ${nf.name}: not found\n`);
    process.exitCode = 1;
  }
  for (const card of res.data) {
    const key = batch.find((n) => n === card.name || card.name.startsWith(`${n} // `)) ?? card.name;
    out[key] = toEntry(key, card);
    process.stdout.write(`ok   ${key}\n`);
  }
}
for (const item of CARDS.filter((c) => typeof c !== 'string')) {
  const res = await getJson(
    `https://api.scryfall.com/cards/search?q=${encodeURIComponent(item.query)}&order=released&dir=desc`,
  );
  const card = res.data.find((c) => c.image_uris) ?? res.data[0];
  out[item.key] = toEntry(item.key, card);
  process.stdout.write(`ok   ${item.key}\n`);
}

for (const e of Object.values(out)) {
  for (const f of [e.front, e.back]) {
    if (f?.image && !/^https:\/\/cards\.scryfall\.io\//.test(f.image.normal)) {
      throw new Error(`unexpected image host for ${e.key}: ${f.image.normal}`);
    }
  }
}
await writeFile(OUT, JSON.stringify(out, null, 1) + '\n');
console.log(`wrote ${Object.keys(out).length} cards to ${OUT}`);
