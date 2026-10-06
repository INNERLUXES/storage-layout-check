import { test } from 'node:test';
import assert from 'node:assert/strict';
import { cp, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { RULES } from '../src/index.js';
import { BAD, EXPECTED, GOOD, GOOD_EXPECTED, UNWANTED, run } from '../tools/example.mjs';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');
const saved = (name) => readFile(resolve(root, 'examples/output', name), 'utf8');
const V1 = 'examples/v1/layout.json';
const V2_BAD = 'examples/v2-bad/layout.json';
const V2_GOOD = 'examples/v2-good/layout.json';

test('examples: the bad upgrade fails with the report that is saved in examples/output', async () => {
  const r = await run(BAD);
  assert.equal(r.code, 1);
  assert.equal(r.err, '');
  assert.equal(r.out, await saved('bad.txt'));
  for (const e of EXPECTED) assert.ok(r.out.includes(e), e);
  for (const u of UNWANTED) assert.ok(!r.out.includes(u), u);
});

test('examples: the good upgrade passes at error and warning level with the report that is saved', async () => {
  const r = await run(GOOD);
  assert.equal(r.code, 0);
  assert.equal(r.out, await saved('good.txt'));
  for (const e of GOOD_EXPECTED) assert.ok(r.out.includes(e), e);
  assert.equal((await run([...GOOD, '--fail-on', 'warning'])).code, 0);
  assert.equal((await run([...GOOD, '--fail-on', 'info'])).code, 1);
  assert.doesNotMatch(r.out, /ERROR {4}|WARNING {2}/);
});

test('examples: every output saved in examples/output is the real output, in all four formats for both upgrades', async () => {
  const outputs = {
    'bad-explain.txt': [...BAD, '--explain'],
    'bad.md': [...BAD, '--format', 'markdown'],
    'bad-explain.md': [...BAD, '--format', 'markdown', '--explain'],
    'bad.json': [...BAD, '--json', '--explain'],
    'bad.sarif': [...BAD, '--format', 'sarif'],
    'good.md': [...GOOD, '--format', 'markdown'],
    'good.json': [...GOOD, '--json'],
    'good.sarif': [...GOOD, '--format', 'sarif'],
    'checks.txt': ['--list-checks'],
    'checks.json': ['--list-checks', '--format', 'json']
  };
  for (const [name, args] of Object.entries(outputs)) assert.equal((await run(args)).out, await saved(name), name);
});

test('examples: every check except the two input checks and the ERC-1967 one fires on the bad upgrade, each on the line built for it', async () => {
  const report = JSON.parse((await run([...BAD, '--json'])).out);
  const linesOf = async (file) => (await readFile(resolve(root, file), 'utf8')).split('\n');
  const old = await linesOf(V1);
  const neu = await linesOf(V2_BAD);
  const at = (lines, needle, n = 1) => {
    let seen = 0;
    for (let i = 0; i < lines.length; i += 1) if (lines[i].includes(needle) && (seen += 1) === n) return i + 1;
    throw new Error(`${needle} x${n}`);
  };
  const of = (id) => report.findings.filter((f) => f.id === id).map((f) => `${f.side}:${f.line}`);
  assert.deepEqual(of('variable-removed'), [`old:${at(old, '"label": "paused"')}`]);
  assert.deepEqual(of('namespace-removed'), [`old:${at(old, '"erc7201:example.vault.legacy"')}`]);
  assert.deepEqual(of('gap-removed'), [`old:${at(old, '"label": "__gap"', 3)}`]);
  assert.deepEqual(of('inheritance-order-changed'), [`new:${at(neu, '"label": "allowed"')}`]);
  assert.deepEqual(of('gap-mismatch'), [`new:${at(neu, '"label": "__gap"', 2)}`]);
  assert.deepEqual(of('variable-inserted'), [`new:${at(neu, '"label": "version"')}`]);
  assert.deepEqual(of('variable-renamed'), [`new:${at(neu, '"label": "ratePerSecond"')}`]);
  assert.deepEqual(of('type-changed'), ['balances', 'positions', 'mode', 'history', 'limit'].map((l) => `new:${at(neu, `"label": "${l}"`)}`));
  assert.equal(of('variable-moved').length, 10);
  assert.deepEqual(report.rules.filter((r) => r.findings === 0).map((r) => r.id), ['layout-unreadable', 'layout-incomplete', 'proxy-slot-overlap', 'type-renamed', 'type-extended']);
  assert.equal(report.rules.length, RULES.length);
});

test('examples: the good upgrade holds the notes the bad one does not', async () => {
  const report = JSON.parse((await run([...GOOD, '--json'])).out);
  assert.deepEqual(report.findings.map((f) => f.id).sort(), ['type-extended', 'type-extended', 'type-renamed', 'variable-renamed']);
  const neu = (await readFile(resolve(root, V2_GOOD), 'utf8')).split('\n');
  const memo = neu.findIndex((l) => l.includes('"label": "memo"')) + 1;
  assert.ok(report.findings.some((f) => f.id === 'variable-renamed' && f.line === memo));
});

test('examples: the same files written with CRLF line ends and as UTF-16 give the same findings', async () => {
  const dir = await mkdtemp(resolve(tmpdir(), 'storage-layout-check-crlf-'));
  try {
    await cp(resolve(root, 'examples'), resolve(dir, 'examples'), { recursive: true });
    const ids = async () => JSON.parse((await run([...BAD, '--json'], dir)).out).findings.map((f) => `${f.id}:${f.side}:${f.line}:${f.column}`);
    const base = await ids();
    for (const f of [V1, V2_BAD]) {
      const text = await readFile(resolve(root, f), 'utf8');
      await writeFile(resolve(dir, f), text.split('\n').join('\r\n'));
    }
    assert.deepEqual(await ids(), base);
    for (const f of [V1, V2_BAD]) {
      const text = await readFile(resolve(root, f), 'utf8');
      await writeFile(resolve(dir, f), Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(text, 'utf16le')]));
    }
    assert.deepEqual(await ids(), base);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test('examples: the files are plain ASCII with LF line ends, made up, and hold no year-like number', async () => {
  for (const f of [V1, V2_BAD, V2_GOOD]) {
    const text = await readFile(resolve(root, f), 'utf8');
    assert.ok([...text].every((c) => c.charCodeAt(0) < 128), f);
    assert.ok(!text.includes('\r'), f);
    assert.doesNotMatch(text, /\b(?:19|20)\d{2}\b/, f);
    assert.doesNotThrow(() => JSON.parse(text), f);
    for (const c of text.match(/"contract": "[^"]+"/g)) assert.match(c, /"contract": "src\/(?:AccessBase|FeeBase|ListBase|Vault)\.sol:(?:AccessBase|FeeBase|ListBase|Vault)"/, f);
  }
});

test('examples: the sample output of the bad upgrade is the one the README shows', async () => {
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  const bad = await saved('bad.txt');
  assert.ok(readme.includes(bad.split('\n').slice(0, 22).join('\n')));
  assert.ok(readme.includes(bad.split('\n').slice(-8).join('\n')));
});
