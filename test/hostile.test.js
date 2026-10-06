import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readdir } from 'node:fs/promises';
import { JSON_LIMITS, checkTexts } from '../src/index.js';
import { allowed, cli, item, layoutText, run, withFiles } from './helpers.js';

// Each test builds input meant to make the tool slow or to exhaust the stack, and checks that it ends with an answer in
// good time. The time allowed is four times as long under coverage (NODE_V8_COVERAGE is set only when coverage is on).

function timed(fn) {
  const start = process.hrtime.bigint();
  const value = fn();
  return { value, ms: Number(process.hrtime.bigint() - start) / 1e6 };
}

test('thousands of variables, every one moved, are compared in good time', () => {
  const old = layoutText({ storage: Array.from({ length: 5000 }, (_, i) => item(`v${i}`, 't_uint256', i, 0, `src/C${i % 50}.sol:C${i % 50}`)) });
  const neu = layoutText({ storage: Array.from({ length: 5000 }, (_, i) => item(`v${i}`, 't_uint256', i + 1, 0, `src/C${i % 50}.sol:C${i % 50}`)) });
  const { value, ms } = timed(() => checkTexts(old, neu));
  assert.equal(value.findings.filter((f) => f.id === 'variable-moved').length, 5000);
  assert.ok(ms < allowed(5000), `took ${ms} ms`);
});

test('thousands of new variables over thousands of old ones are checked for overlap in good time', () => {
  const old = layoutText({ storage: Array.from({ length: 5000 }, (_, i) => item(`old${i}`, 't_uint256', i)) });
  const neu = layoutText({ storage: Array.from({ length: 5000 }, (_, i) => item(`new${i}`, 't_int256', i)) });
  const { value, ms } = timed(() => checkTexts(old, neu));
  assert.equal(value.findings.filter((f) => f.id === 'variable-inserted').length, 5000);
  assert.ok(ms < allowed(5000), `took ${ms} ms`);
});

test('thousands of variables with one name, or at one place, do not make the pairing slow', () => {
  const same = Array.from({ length: 5000 }, (_, i) => item('x', 't_uint256', i, 0, `src/C${i}.sol:C${i}`));
  const onePlace = Array.from({ length: 5000 }, (_, i) => item(`p${i}`, 't_uint256', 0));
  const { ms } = timed(() => {
    checkTexts(layoutText({ storage: same }), layoutText({ storage: same.map((x) => ({ ...x, contract: `${x.contract}V2` })) }));
    checkTexts(layoutText({ storage: onePlace }), layoutText({ storage: onePlace.map((x) => ({ ...x, label: `q${x.label}` })) }));
  });
  assert.ok(ms < allowed(8000), `took ${ms} ms`);
});

test('deep nesting ends with an error finding at the limit, never a stack overflow', () => {
  const deep = `${'['.repeat(100000)}${']'.repeat(100000)}`;
  const { value } = timed(() => checkTexts(deep, deep));
  assert.equal(value.findings[0].id, 'layout-unreadable');
  assert.match(value.findings[0].message, new RegExp(`nested more than ${JSON_LIMITS.maxDepth} deep`));
});

test('a type nested deeper than the limit is a finding about the input, not a stack overflow', () => {
  const types = {};
  let id = 't_uint256';
  for (let i = 0; i < 100; i += 1) {
    const next = `t_mapping(t_uint256,${id})`;
    types[next] = { encoding: 'mapping', key: 't_uint256', label: `mapping ${i}`, numberOfBytes: '32', value: id };
    id = next;
  }
  const l = layoutText({ storage: [item('m', id, 0)], types });
  const { value } = timed(() => checkTexts(l, l));
  assert.deepEqual(value.findings.map((f) => f.id), ['layout-incomplete']);
  assert.match(value.findings[0].message, /nested more than 64 deep/);
});

test('long strings and long lines are read in good time', () => {
  const long = layoutText({ storage: [item('a'.repeat(200000), 't_uint256', 0)] });
  const { value, ms } = timed(() => checkTexts(long, layoutText({})));
  assert.equal(value.findings[0].id, 'variable-removed');
  assert.ok(value.findings[0].message.length < 1600, 'the name is cut in the message');
  assert.ok(ms < allowed(5000), `took ${ms} ms`);
});

test('a slot as large as the storage space, and one with more digits than any slot, are read and refused as they should be', () => {
  const max = (2n ** 256n - 1n).toString();
  const big = layoutText({ storage: [{ ...item('a', 't_uint256', 0), slot: max }] });
  assert.deepEqual(checkTexts(big, big).findings, []);
  const tooLong = layoutText({ storage: [{ ...item('a', 't_uint256', 0), slot: '9'.repeat(200) }] });
  assert.match(checkTexts(tooLong, tooLong).findings[0].message, /has no valid slot/);
});

test('names such as __proto__, constructor and toString are only names', () => {
  const l = layoutText({ storage: [item('__proto__', 'constructor', 0, 0, 'src/x.sol:toString'), item('hasOwnProperty', 't_uint256', 1, 0, '__proto__')], types: { constructor: { encoding: 'inplace', label: 'toString', numberOfBytes: '32' } }, namespaces: JSON.parse(`{"__proto__": ${JSON.stringify([item('constructor', 't_uint256', 0)])}}`) });
  const { value } = timed(() => checkTexts(l, layoutText({})));
  assert.ok(value.findings.some((f) => f.id === 'variable-removed' && f.variable === '__proto__'));
  assert.ok(value.findings.some((f) => f.id === 'namespace-removed'));
  assert.equal({}.polluted, undefined);
  assert.equal(Object.prototype.hasOwnProperty.call(Object.prototype, 'label'), false);
});

test('a run leaves the folder as it was: the tool writes nothing', async () => {
  const files = { 'v1.json': layoutText({ storage: [item('a', 't_uint256', 0)] }), 'v2.json': layoutText({}) };
  await withFiles(files, async (dir) => {
    const before = (await readdir(dir, { recursive: true })).sort();
    await cli(['v1.json', 'v2.json', '--format', 'sarif'], dir);
    assert.deepEqual((await readdir(dir, { recursive: true })).sort(), before);
  });
  assert.equal((await run(files, ['v1.json', 'v2.json'])).code, 1);
});
