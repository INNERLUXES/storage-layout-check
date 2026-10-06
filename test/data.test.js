import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { ERC1967_SLOTS, POINTS, RULES, SOURCES, checkTexts, flat, grouped, listText, plural, pointPage, readSide, safeText, source } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const read = (rel) => readFile(resolve(root, rel), 'utf8');

const PLACES = /^https:\/\/(?:docs\.soliditylang\.org\/en\/latest\/|docs\.openzeppelin\.com\/upgrades-plugins\/|github\.com\/OpenZeppelin\/openzeppelin-upgrades\/blob\/master\/|eips\.ethereum\.org\/EIPS\/|www\.getfoundry\.sh\/reference\/)/;

test('every source has an address on the Solidity, OpenZeppelin, Ethereum EIP or Foundry pages, and no number that reads like a year', () => {
  for (const s of SOURCES) {
    assert.match(s.url, PLACES, s.id);
    assert.doesNotMatch(s.url, /(?<!(?:EIP|ERC)[- ]?)\b(?:19|20)\d{2}\b/i, s.id);
    assert.ok(s.title.length > 5);
  }
  assert.equal(new Set(SOURCES.map((s) => s.id)).size, SOURCES.length);
});

test('every source has a text copy under research/sources that starts with its address, and research/sources.md lists it', async () => {
  const notes = await read('research/sources.md');
  for (const s of SOURCES) {
    const copy = await read(s.file);
    assert.ok(copy.startsWith(`Source: ${s.url}\n`), s.file);
    assert.ok(copy.length > 1500, `${s.file} holds the page`);
    assert.ok(notes.includes(s.url), `research/sources.md lists ${s.id}`);
    assert.ok(notes.includes(s.file), `research/sources.md names ${s.file}`);
  }
});

test('every point belongs to a listed source, is written in a sentence of its own and is not a long quotation of its page', async () => {
  for (const [id, p] of Object.entries(POINTS)) {
    const page = source(p.source);
    assert.ok(page, `${id}: the source ${p.source}`);
    assert.equal(pointPage(id), page);
    assert.ok(p.text.length > 40 && p.text.length < 400, id);
    assert.match(p.text, /\.$/, id);
    const copy = (await read(page.file)).replace(/\s+/g, ' ');
    // No run of 14 words of the point appears word for word in its page.
    const words = p.text.replace(/\s+/g, ' ').split(' ');
    for (let i = 0; i + 14 <= words.length; i += 1) assert.ok(!copy.includes(words.slice(i, i + 14).join(' ')), `${id} quotes its page`);
  }
});

test('every point is used by a rule, and every basis of a rule is a point', () => {
  const used = new Set(RULES.flatMap((r) => r.basis));
  for (const id of Object.keys(POINTS)) assert.ok(used.has(id), `${id} is not used by a rule`);
  for (const id of used) assert.ok(Object.hasOwn(POINTS, id), `${id} is not a point`);
});

test('docs/rules-and-sources.md lists every page with its copy and every check with its level, kind and points', async () => {
  const doc = await read('docs/rules-and-sources.md');
  for (const s of SOURCES) assert.ok(doc.includes(s.url) && doc.includes(s.file), s.id);
  for (const r of RULES) {
    const section = doc.split(/^## /m).find((p) => p.startsWith(`${r.id}\n`));
    assert.ok(section, r.id);
    assert.ok(section.includes(`- Level: ${r.severity}`), r.id);
    for (const b of r.basis) assert.ok(section.includes(POINTS[b].text), `${r.id}: ${b}`);
    if (r.kind === 'best practice') assert.match(section, /best practice of this tool, not a rule in the Solidity or OpenZeppelin documentation/, r.id);
    if (r.own) assert.ok(section.includes(r.own), `${r.id}: its own choice`);
  }
});

test('the documented checks name a page, and the best practice checks say what is their own choice', () => {
  for (const r of RULES.filter((x) => x.kind === 'documented')) assert.ok(r.basis.length > 0, r.id);
  for (const r of RULES.filter((x) => x.kind === 'best practice')) assert.ok(r.own, `${r.id} says what is its own choice`);
});

test('the example layout of the Solidity page is read with no problem and compared with itself gives no finding', async () => {
  const page = await read('research/sources/solidity-layout-in-storage.txt');
  const start = page.indexOf('{', page.indexOf('### Storage Layout'));
  const end = page.indexOf('### Transient Storage Layout');
  const text = page.slice(start, end).trim();
  const side = readSide(text);
  assert.equal(side.form, 'layout');
  assert.deepEqual(side.layout.problems, []);
  assert.deepEqual(side.layout.spaces[0].items.map((i) => `${i.label}@${i.slot}`), ['x@0', 'w@1', 's@2', 'addr@6', 'map@7', 'array@8', 's1@9', 'b1@10']);
  assert.equal(side.layout.types.describe('t_struct(S)13_storage').members.length, 4);
  assert.deepEqual(checkTexts(text, text).findings, []);
  // The same layout with the last two variables swapped: string and bytes are one storage form, so the names move.
  const swapped = text.replace('"label": "s1"', '"label": "TMP"').replace('"label": "b1"', '"label": "s1"').replace('"label": "TMP"', '"label": "b1"');
  assert.deepEqual(checkTexts(text, swapped).findings.map((f) => f.id).sort(), ['type-renamed', 'type-renamed', 'variable-moved', 'variable-moved']);
});

test('the ERC-1967 slots are the ones the ERC page gives', async () => {
  const page = await read('research/sources/erc-1967-proxy-storage-slots.txt');
  for (const s of ERC1967_SLOTS) assert.ok(page.includes(`Storage slot 0x${s.slot.toString(16).padStart(64, '0')}`), s.holds);
});

test('the OpenZeppelin layout format carries namespaces and enum members as the tool reads them', async () => {
  const page = await read('research/sources/oz-upgrades-core-layout.ts.txt');
  assert.ok(page.includes('namespaces?: Record<string, StorageItem[]>;'));
  assert.ok(page.includes('export type EnumMember = string;'));
  assert.ok(page.includes('underlying?: Type;'));
});

test('size helpers: grouped numbers, lists for a sentence and plurals', () => {
  assert.equal(grouped(12345), '12,345');
  assert.equal(listText(['a']), 'a');
  assert.equal(listText(['a', 'b']), 'a and b');
  assert.equal(listText(['a', 'b', 'c']), 'a, b and c');
  assert.equal(listText(['a', 'b', 'c', 'd', 'e'], 3), 'a, b, c and 2 more');
  assert.equal(plural(1, 'line'), '1 line');
  assert.equal(plural(2, 'line'), '2 lines');
  assert.equal(plural(2, 'library', 'libraries'), '2 libraries');
});

test('text helpers: safeText replaces control, direction and separator characters and caps the length; flat folds white space', () => {
  const bad = ['a', '\u001b', '[31m', '\u202e', 'b', '\u2028', 'c', '\u0007', 'd', '\u0085', 'e'].join('');
  const out = safeText(bad);
  assert.ok(![...out].some((c) => c.charCodeAt(0) < 32 || [0x202e, 0x2028, 0x85].includes(c.charCodeAt(0))));
  assert.equal(safeText('x'.repeat(50), 10), 'xxxxxxx...');
  assert.equal(safeText('short', 10), 'short');
  assert.equal(flat('  a \n  b\t c '), 'a b c');
});
