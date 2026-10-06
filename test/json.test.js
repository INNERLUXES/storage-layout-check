import { test } from 'node:test';
import assert from 'node:assert/strict';
import { JSON_LIMITS, JsonError, entryOf, isArray, isNumber, isObject, isString, readJson, valueOf } from '../src/index.js';

const fails = (text, pattern) => assert.throws(() => readJson(text), (e) => e instanceof JsonError && pattern.test(e.message), text.slice(0, 40));

test('readJson: objects, arrays, strings, numbers, booleans and null, with the line and column of each value', () => {
  const root = readJson('{\n  "a": [1, -2.5e3, true, false, null],\n  "b": {"c": "d"}\n}\n');
  assert.ok(isObject(root));
  assert.equal(root.line, 1);
  const a = valueOf(root, 'a');
  assert.ok(isArray(a));
  assert.deepEqual(a.items.map((n) => n.value), [1, -2500, true, false, null]);
  assert.deepEqual(a.items.map((n) => n.kind), ['number', 'number', 'boolean', 'boolean', 'null']);
  assert.equal(a.line, 2);
  assert.equal(a.column, 8);
  assert.equal(a.items[1].raw, '-2.5e3');
  const c = valueOf(valueOf(root, 'b'), 'c');
  assert.ok(isString(c));
  assert.equal(c.value, 'd');
  assert.equal(c.line, 3);
  assert.equal(entryOf(root, 'b').line, 3);
  assert.equal(entryOf(root, 'b').column, 3);
  assert.equal(valueOf(root, 'missing'), undefined);
  assert.equal(valueOf(a, 'a'), undefined, 'an array has no keys');
  assert.ok(isNumber(a.items[0]));
});

test('readJson: the escapes of JSON, a surrogate pair and an escaped quote', () => {
  const root = readJson('"a\\"b\\\\c\\/d\\b\\f\\n\\r\\t\\u0041\\ud83d\\ude00"');
  assert.equal(root.value, `a"b\\c/d\b\f\n\r\tA\ud83d\ude00`);
});

test('readJson: LF, CRLF and CR line ends give the same lines', () => {
  for (const sep of ['\n', '\r\n', '\r']) {
    const root = readJson(['{', '"a": 1,', '', '"b": 2', '}'].join(sep));
    assert.equal(entryOf(root, 'b').line, 4, JSON.stringify(sep));
  }
});

test('readJson: what is not JSON stops the reader with the line and column', () => {
  fails('', /holds no JSON value/);
  fails('{"a": 1,}', /expected a key in double quotes/);
  fails('[1, 2', /expected "," or "\]" and found the end of the file/);
  fails('{"a" 1}', /expected ":" after a key/);
  fails("{'a': 1}", /expected a key in double quotes/);
  fails('// note\n{}', /expected a value/);
  fails('{"a": 01}', /expected "," or "}"/);
  fails('{"a": .5}', /expected a value/);
  fails('{"a": tru}', /expected a value/);
  fails('"abc', /a string is not closed/);
  fails('"a\nb"', /control character or a line end/);
  fails('"\\x41"', /an escape JSON does not have/);
  fails('"\\u00g1"', /four hex digits/);
  fails('{} {}', /text after the end of the JSON value/);
  fails('{"a": 1, "a": 2}', /the key "a" is written twice in one object/);
  assert.throws(() => readJson('{\n  "a": [1,\n  2,,]\n}'), (e) => e.line === 3 && e.column === 5 && /expected a value and found ","/.test(e.message));
});

test('readJson: the limits of nesting, values and string length stop the reader with the limit named', () => {
  assert.throws(() => readJson(`${'['.repeat(JSON_LIMITS.maxDepth + 1)}${']'.repeat(JSON_LIMITS.maxDepth + 1)}`), /nested more than 1000 deep/);
  assert.doesNotThrow(() => readJson(`${'['.repeat(JSON_LIMITS.maxDepth)}${']'.repeat(JSON_LIMITS.maxDepth)}`));
  assert.throws(() => readJson('[1, 2, 3, 4]', { ...JSON_LIMITS, maxNodes: 4 }), /more than 4 values/);
  assert.throws(() => readJson('"abcdefghij"', { ...JSON_LIMITS, maxStringLength: 5 }), /longer than 5 characters/);
});

test('readJson: keys are names, never properties of an object', () => {
  const root = readJson('{"__proto__": {"x": 1}, "constructor": 2, "toString": 3}');
  assert.deepEqual(root.entries.map((e) => e.key), ['__proto__', 'constructor', 'toString']);
  assert.equal(valueOf(root, 'constructor').value, 2);
  assert.equal({}.x, undefined);
});
