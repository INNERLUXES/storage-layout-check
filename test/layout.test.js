import { test } from 'node:test';
import assert from 'node:assert/strict';
import { InputError, TYPE_LIMITS, TypeTable, checkTexts, compareTypes, contractMap, contractName, isGap, kindOf, layoutsIn, parseTypeId, pickLayout, readJson, readLayout, readSide, worse } from '../src/index.js';
import { TYPES, item, layoutText } from './helpers.js';

const LAYOUT = { storage: [item('a', 't_uint256', 0, 0, 'src/A.sol:A')], types: { t_uint256: TYPES.t_uint256 } };
const OTHER = { storage: [item('b', 't_uint256', 0, 0, 'src/B.sol:B')], types: { t_uint256: TYPES.t_uint256 } };
const OUTPUT = JSON.stringify({ contracts: { 'src/A.sol': { A: { abi: [], storageLayout: LAYOUT } }, 'src/B.sol': { B: { storageLayout: OTHER }, I: { abi: [] } } } });

test('parseTypeId: the head, the ids in the first parentheses split at the first level, and the tail', () => {
  assert.deepEqual(parseTypeId('t_uint256'), { head: 't_uint256', args: [], tail: '' });
  assert.deepEqual(parseTypeId('t_mapping(t_uint256,t_mapping(t_address,t_bool))'), { head: 't_mapping', args: ['t_uint256', 't_mapping(t_address,t_bool)'], tail: '' });
  assert.deepEqual(parseTypeId('t_array(t_uint256)3_storage'), { head: 't_array', args: ['t_uint256'], tail: '3_storage' });
  assert.deepEqual(parseTypeId('t_struct(S)13_storage'), { head: 't_struct', args: ['S'], tail: '13_storage' });
  assert.deepEqual(parseTypeId('t_broken(t_uint256'), { head: 't_broken(t_uint256', args: [], tail: '' });
});

test('kindOf: mappings, arrays, structs, enums, user-defined value types, bytes and string, addresses and contracts, values', () => {
  assert.equal(kindOf('t_mapping(t_address,t_bool)', 'mapping', false), 'mapping');
  assert.equal(kindOf('t_array(t_uint256)dyn_storage', 'dynamic_array', false), 'dynamic_array');
  assert.equal(kindOf('t_array(t_uint256)dyn_storage', undefined, false), 'dynamic_array');
  assert.equal(kindOf('t_array(t_uint256)3_storage', 'inplace', false), 'static_array');
  assert.equal(kindOf('t_other', 'dynamic_array', false), 'dynamic_array');
  assert.equal(kindOf('t_struct(S)1_storage', 'inplace', true), 'struct');
  assert.equal(kindOf('t_enum(E)1', 'inplace', false), 'enum');
  assert.equal(kindOf('t_userDefinedValueType(P)1', 'inplace', false), 'udvt');
  assert.equal(kindOf('t_string_storage', 'bytes', false), 'bytes');
  assert.equal(kindOf('t_bytes_storage', undefined, false), 'bytes');
  assert.equal(kindOf('t_bytes32', 'inplace', false), 'value');
  assert.equal(kindOf('t_contract(IToken)9', 'inplace', false), 'address');
  assert.equal(kindOf('t_address_payable', 'inplace', false), 'address');
  assert.equal(kindOf('t_uint8', 'inplace', false), 'value');
});

test('worse: changed over unknown over extended over renamed over same', () => {
  const r = (verdict) => ({ verdict, reason: verdict });
  assert.equal(worse(r('same'), r('renamed')).verdict, 'renamed');
  assert.equal(worse(r('changed'), r('extended')).verdict, 'changed');
  assert.equal(worse(r('extended'), r('unknown')).verdict, 'unknown');
  assert.equal(worse(r('renamed'), r('same')).verdict, 'renamed');
});

test('compareTypes: a struct that refers to itself through a mapping ends, and a type nested past the limit is unknown', () => {
  const self = { 't_struct(N)1_storage': { encoding: 'inplace', label: 'struct C.N', members: [item('kids', 't_mapping(t_uint256,t_struct(N)1_storage)', 0)], numberOfBytes: '32' }, 't_mapping(t_uint256,t_struct(N)1_storage)': { encoding: 'mapping', key: 't_uint256', label: 'mapping(uint256 => struct C.N)', numberOfBytes: '32', value: 't_struct(N)1_storage' }, t_uint256: TYPES.t_uint256 };
  const table = (types) => new TypeTable(readJson(JSON.stringify(types)), []);
  assert.equal(compareTypes(table(self), 't_struct(N)1_storage', table(self), 't_struct(N)1_storage').verdict, 'same');
  const deep = { t_uint256: TYPES.t_uint256 };
  let id = 't_uint256';
  for (let i = 0; i < TYPE_LIMITS.maxDepth + 5; i += 1) {
    const next = `t_mapping(t_uint256,${id})`;
    deep[next] = { encoding: 'mapping', key: 't_uint256', label: 'mapping', numberOfBytes: '32', value: id };
    id = next;
  }
  const r = compareTypes(table(deep), id, table(deep), id);
  assert.equal(r.verdict, 'unknown');
  assert.match(r.reason, /nested more than 64 deep/);
  assert.equal(compareTypes(table(deep), 't_missing', table(deep), 't_uint256').verdict, 'unknown');
});

test('compareTypes: the key and value of a mapping are taken from its id when the entry does not name them', () => {
  const types = { 't_mapping(t_address,t_uint256)': { label: 'mapping(address => uint256)', numberOfBytes: '32' }, 't_mapping(t_uint256,t_uint256)': { label: 'mapping(uint256 => uint256)', numberOfBytes: '32' }, t_address: TYPES.t_address, t_uint256: TYPES.t_uint256 };
  const t = new TypeTable(readJson(JSON.stringify(types)), []);
  assert.equal(compareTypes(t, 't_mapping(t_address,t_uint256)', t, 't_mapping(t_uint256,t_uint256)').verdict, 'changed');
  assert.equal(t.describe('t_mapping(t_address,t_uint256)').key, 't_address');
});

test('isGap and contractName', () => {
  assert.ok(isGap('__gap'));
  assert.ok(isGap('__gap_fees'));
  assert.ok(!isGap('__gapless'));
  assert.ok(!isGap('gap'));
  assert.equal(contractName('src/Vault.sol:Vault'), 'Vault');
  assert.equal(contractName('Vault'), 'Vault');
});

test('layoutsIn: the layout object, an artifact, a standard JSON output and a build info file', () => {
  assert.equal(layoutsIn(readJson(JSON.stringify(LAYOUT))).form, 'layout');
  const artifact = layoutsIn(readJson(JSON.stringify({ contractName: 'A', storageLayout: LAYOUT })));
  assert.equal(artifact.form, 'artifact');
  assert.equal(artifact.candidates[0].name, 'A');
  const output = layoutsIn(readJson(OUTPUT));
  assert.equal(output.form, 'standard-json');
  assert.deepEqual(output.candidates.map((c) => `${c.path}:${c.name}`), ['src/A.sol:A', 'src/B.sol:B']);
  assert.equal(layoutsIn(readJson(JSON.stringify({ output: JSON.parse(OUTPUT) }))).form, 'build-info');
  assert.equal(layoutsIn(readJson('{"abi": []}')).form, null);
  assert.equal(layoutsIn(readJson('[]')).form, null);
});

test('pickLayout: one contract of an output by name or by path:Name; several with no name, or an unknown name, stop the run', () => {
  const root = readJson(OUTPUT);
  assert.equal(pickLayout(root, 'B').name, 'B');
  assert.equal(pickLayout(root, 'src/A.sol:A').name, 'A');
  assert.throws(() => pickLayout(root, null, 'the old file'), (e) => e instanceof InputError && /the old file: holds the storage layouts of 2 contracts; pick one with --contract, such as --contract B; the contracts are src\/A\.sol:A, src\/B\.sol:B/.test(e.message));
  assert.throws(() => pickLayout(root, 'Nope'), /no contract named Nope with a storage layout; the contracts are src\/A\.sol:A, src\/B\.sol:B/);
  const twice = readJson(JSON.stringify({ contracts: { 'a.sol': { A: { storageLayout: LAYOUT } }, 'b.sol': { A: { storageLayout: LAYOUT } } } }));
  assert.throws(() => pickLayout(twice, 'A'), /A names 2 contracts \(a\.sol:A, b\.sol:A\); give path:Name/);
  assert.equal(pickLayout(twice, 'b.sol:A').name, 'A');
  const one = readJson(JSON.stringify({ contracts: { 'a.sol': { A: { storageLayout: LAYOUT }, I: { abi: [] } } } }));
  assert.equal(pickLayout(one).name, 'A', 'one contract with a layout needs no name');
});

test('checkTexts: two contracts of one compiler output, picked with --contract <old>,<new>', () => {
  const r = checkTexts(OUTPUT, OUTPUT, { contract: ['A', 'B'] });
  assert.equal(r.old.contract, 'A');
  assert.equal(r.new.contract, 'B');
  assert.equal(r.old.form, 'standard-json');
  assert.deepEqual(r.findings.map((f) => f.id), ['variable-renamed']);
});

test('readLayout: the storage list, the namespaces, and what is not a namespace', () => {
  const l = readLayout(readJson(layoutText({ storage: [item('a', 't_uint256', 0)], namespaces: { 'erc7201:x': [item('v', 't_uint256', 0)], 'erc7201:y': 3 } })));
  assert.deepEqual(l.spaces.map((s) => s.id), ['', 'erc7201:x']);
  assert.match(l.problems[0].message, /The namespace erc7201:y is not a list of variables/);
  const bad = readLayout(readJson('{"storage": [], "namespaces": []}'));
  assert.match(bad.problems[0].message, /The namespaces of the layout are not an object/);
  const items = readLayout(readJson('{"storage": [3, {"label": "a", "slot": 1, "offset": 0, "type": "t_uint256"}], "types": {}}'));
  assert.match(items.problems[0].message, /An entry of the storage list is not an object/);
  assert.equal(items.spaces[0].items[0].slot, 1n, 'a slot written as a number is read');
  assert.equal(items.spaces[0].items[0].contract, '', 'a variable with no contract is read');
});

test('readSide: the contract and form of a side, and the counts the report shows', () => {
  const side = readSide(JSON.stringify({ storageLayout: LAYOUT }));
  assert.equal(side.form, 'artifact');
  assert.equal(side.layout.spaces[0].items.length, 1);
  const r = checkTexts(layoutText({ storage: [item('a', 't_uint256', 0, 0, 'src/A.sol:A'), item('b', 't_uint256', 1, 0, 'src/B.sol:B')], namespaces: { 'erc7201:x': [item('v', 't_uint256', 0)] } }), layoutText({}));
  assert.deepEqual([r.old.variables, r.old.contracts, r.old.namespaces, r.old.namespaced], [2, 2, 1, 1]);
});

test('contractMap: no map when the names are the same, or when more than one name differs', () => {
  const l = (names) => readLayout(readJson(layoutText({ storage: names.map((n, i) => item(`v${i}`, 't_uint256', i, 0, `src/${n}.sol:${n}`)) })));
  assert.equal(contractMap(l(['A', 'B']), l(['A', 'B'])).map.size, 0);
  assert.equal(contractMap(l(['A', 'B']), l(['C', 'D'])).map.size, 0);
  assert.deepEqual([...contractMap(l(['A', 'B']), l(['A', 'C'])).map], [['B', 'C']]);
  assert.deepEqual([...contractMap(l(['A', 'B']), l(['A', 'C']), ['B', 'C']).map], [['B', 'C']]);
});
