/**
 * Guards issue #3: no user-facing text hard-coded outside the catalogues (`en.ts`, `fr.ts`).
 * Walks the TypeScript syntax of the UI sources and fails on:
 *  - text between JSX tags, and string literals as JSX children;
 *  - a string literal in a `title`, `aria-label`, `placeholder`, `alt` or `label` attribute;
 *  - in components, state, model and adapter: a string literal that reads as prose (two words, or a capitalised word),
 *    unless it is in ENGINE_TEXT below.
 * Not covered: `engineText.ts` (the engine's English prompt text rewritten as English, kept English on purpose),
 * `src/mock/` (mock engine data), tests and generated wire types.
 */
import ts from 'typescript';
import { describe, expect, it } from 'vitest';

/** The UI sources as raw text, keyed by path relative to src/ (no node typings in this project). */
const SOURCES = import.meta.glob(
  [
    '../components/**/*.{ts,tsx}',
    '../state/**/*.{ts,tsx}',
    '../model/**/*.{ts,tsx}',
    '../adapter/**/*.{ts,tsx}',
    '!../**/*.test.{ts,tsx}',
    '!../adapter/engineText.ts',
  ],
  { query: '?raw', import: 'default', eager: true },
) as Record<string, string>;
const TEXT_ATTRS = new Set(['title', 'aria-label', 'aria-description', 'placeholder', 'alt', 'label']);

/**
 * Strings that are not shown: values compared with the engine's own words (button labels, card states, keyword names),
 * keyboard `event.key` values, group ids and developer errors.
 */
const ENGINE_TEXT = new Set([
  'Escape',
  'Enter',
  'Original',
  'Haste',
  'Loyalty',
  'Defense',
  'Cancel',
  'Command',
  'Commander',
  'Choose',
  'Keep',
  'Mulligan',
  'Undo',
  'Auto',
  'Play',
  'Look',
  'Screen',
  'Alpha Strike',
  'Call Back',
  'Select cards to be put into the graveyard',
  'artifact or creature',
  'first strike',
  'double strike',
  'battle cry',
  'hexproof from white',
  'hexproof from blue',
  'hexproof from black',
  'hexproof from red',
  'hexproof from green',
  'empty recording',
  '[live] wire schema differs from this build',
  'useMatch outside MatchProvider',
  'unknown message type',
]);

/** Template pieces that are code, not words: URLs, CSS functions and units, message-markup placeholders, developer errors. */
const TEMPLATE_CODE = /^(https?:|\/|&|url\(|calc\(|minmax\(|\{(player|card):|fr\)|unknown )/;
const PROSE = /[A-Za-z]{2,}[ ,.'’:;!?][A-Za-z]|^[A-Z][a-z]{3,}$/;
const LETTERS = /[A-Za-z]{2,}/;

function offences([file, text]: [string, string]): string[] {
  const sf = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, file.endsWith('x') ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const out: string[] = [];
  const at = (n: ts.Node) => `${file.replace('../', '')}:${sf.getLineAndCharacterOfPosition(n.getStart()).line + 1}`;
  const visit = (n: ts.Node) => {
    if (ts.isJsxText(n) && LETTERS.test(n.text)) out.push(`${at(n)} JSX text "${n.text.trim()}"`);
    else if (ts.isJsxAttribute(n) && TEXT_ATTRS.has(n.name.getText()) && n.initializer && ts.isStringLiteral(n.initializer) && LETTERS.test(n.initializer.text)) {
      out.push(`${at(n)} ${n.name.getText()}="${n.initializer.text}"`);
    } else if (ts.isJsxExpression(n) && n.expression && ts.isStringLiteralLike(n.expression) && LETTERS.test(n.expression.text) && !ENGINE_TEXT.has(n.expression.text)) {
      out.push(`${at(n)} JSX child "${n.expression.text}"`);
    } else if (ts.isStringLiteralLike(n) && !ts.isImportDeclaration(n.parent) && !ts.isExportDeclaration(n.parent) && !ts.isLiteralTypeNode(n.parent) && !ts.isJsxAttribute(n.parent)) {
      if (PROSE.test(n.text) && !ENGINE_TEXT.has(n.text) && !/^[\w.]+$/.test(n.text) && !/^(https?:|\.\/)/.test(n.text)) out.push(`${at(n)} "${n.text}"`);
    } else if (ts.isTemplateHead(n) || ts.isTemplateMiddle(n) || ts.isTemplateTail(n)) {
      // words around the placeholders of a template: `Turn ${n}`
      if (/[A-Za-z]{3,}/.test(n.text) && !/^[\w\-.:|#[\]="']*$/.test(n.text) && !TEMPLATE_CODE.test(n.text) && !ENGINE_TEXT.has(n.text.trim())) out.push(`${at(n)} template "${n.text}"`);
    }
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

describe('no hard-coded user-facing text', () => {
  const all = Object.entries(SOURCES);

  it('scans the UI sources', () => {
    expect(all.length).toBeGreaterThan(60);
  });

  it('keeps every word in the catalogues', () => {
    expect(all.flatMap(offences)).toEqual([]);
  });

  it('catches a hard-coded string (the guard itself)', () => {
    const bad = offences(['../components/Fake.tsx', "export const F = () => <button title=\"Close\">Save changes {'Done now'}</button>;"]);
    const text = bad.join('\n');
    for (const w of ['title="Close"', 'JSX text "Save changes"', 'Done now']) expect(text).toContain(w);
  });
});
