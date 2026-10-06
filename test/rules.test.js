import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ERC1967_SLOTS, RULES, checkTexts, nameOf, slotText } from '../src/index.js';
import { findingsOf, idsOf, item, layoutText, lineOf, ofCheck, struct } from './helpers.js';

const A = 'src/A.sol:A';
const B = 'src/B.sol:B';
const C = 'src/C.sol:C';
const D = 'src/D.sol:D';

test('every check has an id, a level, a kind, a summary and a fix, and the ids are unique', () => {
  assert.equal(RULES.length, 14);
  assert.equal(new Set(RULES.map((r) => r.id)).size, RULES.length);
  for (const r of RULES) {
    assert.ok(['error', 'warning', 'info'].includes(r.severity), r.id);
    assert.ok(['documented', 'best practice', 'input'].includes(r.kind), r.id);
    assert.ok(r.summary.length > 20 && r.fix.length > 20, r.id);
  }
});

test('the same layout gives no finding', () => {
  const l = { storage: [item('a', 't_uint256', 0), item('b', 't_address', 1), item('c', 't_bool', 1, 20)] };
  assert.deepEqual(idsOf(l, l), []);
});

test('variable-removed: a variable that is gone, at the line of the old file; not when it is renamed at its place', () => {
  const old = { storage: [item('a', 't_uint256', 0), item('b', 't_uint256', 1)] };
  const f = ofCheck(old, { storage: [item('a', 't_uint256', 0)] }, 'variable-removed');
  assert.equal(f.length, 1);
  assert.equal(f[0].side, 'old');
  assert.equal(f[0].line, lineOf(layoutText(old), '"label": "b"'));
  assert.match(f[0].message, /^C\.b \(uint256\) at slot 1, offset 0 is not in the new layout/);
  assert.match(f[0].message, /constant or an immutable/);
  assert.deepEqual(idsOf(old, { storage: [item('a', 't_uint256', 0), item('renamed', 't_uint256', 1)] }), ['variable-renamed']);
});

test('variable-moved: a variable at another slot or offset; not at the same place', () => {
  const old = { storage: [item('a', 't_uint256', 0), item('b', 't_uint256', 1)] };
  const swapped = { storage: [item('b', 't_uint256', 0), item('a', 't_uint256', 1)] };
  const moved = ofCheck(old, swapped, 'variable-moved');
  assert.equal(moved.length, 2);
  assert.ok(moved.some((f) => /C\.b moves from slot 1, offset 0 to slot 0, offset 0/.test(f.message)));
  assert.ok(moved.every((f) => f.side === 'new'));
  const packed = { storage: [item('x', 't_uint128', 0), item('y', 't_uint128', 0, 16)] };
  const repacked = { storage: [item('y', 't_uint128', 0), item('x', 't_uint128', 0, 16)] };
  assert.ok(ofCheck(packed, repacked, 'variable-moved').some((f) => /C\.y moves from slot 0, offset 16 to slot 0, offset 0/.test(f.message)));
  assert.deepEqual(ofCheck(packed, packed, 'variable-moved'), []);
});

test('type-changed: size, signedness, another type of the same size, and the near misses that keep the storage form', () => {
  const at = (type) => ({ storage: [item('v', type, 0)] });
  const changed = (a, b) => ofCheck(at(a), at(b), 'type-changed');
  assert.match(changed('t_uint128', 't_uint256')[0].message, /uint128 becomes uint256: the size changes from 16 bytes to 32 bytes/);
  assert.match(changed('t_int256', 't_uint256')[0].message, /int256 becomes uint256: the same size with another signedness/);
  assert.match(changed('t_bytes32', 't_uint256')[0].message, /another type of the same size/);
  assert.match(changed('t_bool', 't_uint256')[0].message, /the size changes from 1 byte to 32 bytes/);
  assert.match(changed('t_uint256', 't_string_storage')[0].message, /a type with another storage form/);
  assert.deepEqual(changed('t_uint256', 't_uint256'), []);
  assert.deepEqual(idsOf(at('t_address'), at('t_address_payable')), ['type-renamed']);
  assert.deepEqual(idsOf(at('t_string_storage'), at('t_bytes_storage')), ['type-renamed']);
  assert.deepEqual(idsOf(at('t_address'), at('t_contract(IToken)9')), ['type-renamed']);
});

test('type-changed: the key or the value of a mapping, and the element of a dynamic array', () => {
  const at = (type) => ({ storage: [item('m', type, 0)] });
  assert.match(ofCheck(at('t_mapping(t_address,t_uint256)'), at('t_mapping(t_uint256,t_uint256)'), 'type-changed')[0].message, /the key type of the mapping changes: address becomes uint256/);
  assert.match(ofCheck(at('t_mapping(t_address,t_uint256)'), at('t_mapping(t_address,t_int256)'), 'type-changed')[0].message, /the value type of the mapping changes: uint256 becomes int256/);
  assert.match(ofCheck(at('t_array(t_uint256)dyn_storage'), at('t_array(t_int256)dyn_storage'), 'type-changed')[0].message, /the element type of the array changes/);
  assert.deepEqual(idsOf(at('t_mapping(t_address,t_uint256)'), at('t_mapping(t_address,t_uint256)')), []);
});

test('type-changed: the length of a static array, and not an array of the same length', () => {
  const at = (type) => ({ storage: [item('h', type, 0)] });
  assert.match(ofCheck(at('t_array(t_uint256)3_storage'), at('t_array(t_uint256)4_storage'), 'type-changed')[0].message, /uint256\[3\] becomes uint256\[4\]: the length changes from 3 to 4/);
  assert.deepEqual(idsOf(at('t_array(t_uint256)3_storage'), at('t_array(t_uint256)3_storage')), []);
});

test('type-changed: struct members changed, removed or moved, compared by content so that the ids of the syntax tree do not count', () => {
  const s = (id, members, bytes) => ({ storage: [item('p', id, 0)], types: { [id]: struct('struct C.P', members, bytes) } });
  const base = [['owner', 't_address', 0, 0], ['amount', 't_uint128', 1, 0], ['since', 't_uint64', 1, 16]];
  assert.deepEqual(idsOf(s('t_struct(P)5_storage', base, 64), s('t_struct(P)77_storage', base, 64)), [], 'only the id of the syntax tree differs');
  const wider = [['owner', 't_address', 0, 0], ['amount', 't_uint128', 1, 0], ['since', 't_uint128', 1, 16]];
  assert.match(ofCheck(s('t_struct(P)5_storage', base, 64), s('t_struct(P)6_storage', wider, 64), 'type-changed')[0].message, /member since of struct C\.P changes: uint64 becomes uint128/);
  assert.match(ofCheck(s('t_struct(P)5_storage', base, 64), s('t_struct(P)6_storage', base.slice(0, 2), 64), 'type-changed')[0].message, /member since of struct C\.P is removed/);
  const swapped = [['amount', 't_uint128', 0, 0], ['owner', 't_address', 1, 0], ['since', 't_uint64', 1, 20]];
  assert.match(ofCheck(s('t_struct(P)5_storage', base, 64), s('t_struct(P)6_storage', swapped, 64), 'type-changed')[0].message, /member owner of struct C\.P moves/);
  const inserted = [['owner', 't_address', 0, 0], ['added', 't_uint128', 1, 0], ['amount', 't_uint128', 2, 0], ['since', 't_uint64', 2, 16]];
  assert.match(ofCheck(s('t_struct(P)5_storage', base, 64), s('t_struct(P)6_storage', inserted, 96), 'type-changed')[0].message, /member amount of struct C\.P moves from slot 1, offset 0 to slot 2, offset 0/);
  const replaced = [['owner', 't_address', 0, 0], ['other', 't_int128', 1, 0], ['since', 't_uint64', 1, 16]];
  assert.match(ofCheck(s('t_struct(P)5_storage', base, 64), s('t_struct(P)6_storage', replaced, 64), 'type-changed')[0].message, /member amount of struct C\.P is replaced by other: uint128 becomes int128/);
  const renamedMember = [['holder', 't_address', 0, 0], ['amount', 't_uint128', 1, 0], ['since', 't_uint64', 1, 16]];
  assert.match(ofCheck(s('t_struct(P)5_storage', base, 64), s('t_struct(P)6_storage', renamedMember, 64), 'type-renamed')[0].message, /member owner of struct C\.P is now holder/);
});

test('type-changed and type-extended: a struct that grows is safe as a mapping value or within its old size, and not in sequence', () => {
  const two = [['a', 't_uint256', 0, 0], ['b', 't_uint64', 1, 0]];
  const three = [...two, ['c', 't_uint256', 2, 0]];
  const packed = [...two, ['c', 't_uint64', 1, 8]];
  const types = (members, bytes) => ({ 't_struct(S)3_storage': struct('struct C.S', members, bytes), 't_mapping(t_address,t_struct(S)3_storage)': { encoding: 'mapping', key: 't_address', label: 'mapping(address => struct C.S)', numberOfBytes: '32', value: 't_struct(S)3_storage' }, 't_array(t_struct(S)3_storage)dyn_storage': { base: 't_struct(S)3_storage', encoding: 'dynamic_array', label: 'struct C.S[]', numberOfBytes: '32' } });
  const inMapping = (members, bytes) => ({ storage: [item('m', 't_mapping(t_address,t_struct(S)3_storage)', 0)], types: types(members, bytes) });
  const inSequence = (members, bytes) => ({ storage: [item('s', 't_struct(S)3_storage', 0)], types: types(members, bytes) });
  const inArray = (members, bytes) => ({ storage: [item('l', 't_array(t_struct(S)3_storage)dyn_storage', 0)], types: types(members, bytes) });
  assert.match(ofCheck(inMapping(two, 64), inMapping(three, 96), 'type-extended')[0].message, /c is appended to struct C\.S, which is stored as the value of a mapping/);
  assert.match(ofCheck(inSequence(two, 64), inSequence(three, 96), 'type-changed')[0].message, /grows from 64 bytes to 96 bytes where it is stored in sequence/);
  assert.match(ofCheck(inArray(two, 64), inArray(three, 96), 'type-changed')[0].message, /the element type of the array changes/);
  assert.match(ofCheck(inSequence(two, 64), inSequence(packed, 64), 'type-extended')[0].message, /within its old size of 64 bytes/);
  assert.deepEqual(idsOf(inMapping(two, 64), inMapping(two, 64)), []);
});

test('type-changed and type-extended: enum members removed, reordered or appended, and a size change', () => {
  const e = (members, bytes = 1) => ({ storage: [item('mode', 't_enum(M)4', 0)], types: { 't_enum(M)4': { encoding: 'inplace', label: 'enum C.M', ...(members ? { members } : {}), numberOfBytes: String(bytes) } } });
  assert.match(ofCheck(e(['A', 'B', 'C']), e(['A', 'C']), 'type-changed')[0].message, /B is removed/);
  assert.match(ofCheck(e(['A', 'B']), e(['B', 'A']), 'type-changed')[0].message, /are reordered/);
  assert.match(ofCheck(e(['A', 'B']), e(['A', 'B', 'C', 'D']), 'type-extended')[0].message, /C, D are appended to enum C\.M/);
  assert.match(ofCheck(e(null), e(null, 2), 'type-changed')[0].message, /the size changes from 1 byte to 2 bytes/);
  assert.deepEqual(idsOf(e(null), e(null)), [], 'with no members listed, an enum of the same size and name is the same');
  assert.deepEqual(idsOf(e(['A']), e(['A'])), []);
});

test('type-renamed: a user-defined value type, with its underlying type named or not', () => {
  const t = (id, label, extra = {}) => ({ [id]: { encoding: 'inplace', label, numberOfBytes: '32', ...extra } });
  const at = (id, types) => ({ storage: [item('price', id, 0)], types });
  const price = 't_userDefinedValueType(Price)8';
  assert.match(ofCheck(at('t_uint256', {}), at(price, t(price, 'Price')), 'type-renamed')[0].message, /does not name the type a user-defined value type wraps/);
  assert.match(ofCheck(at('t_uint256', {}), at(price, t(price, 'Price', { underlying: 't_uint256' })), 'type-renamed')[0].message, /uint256 is now Price/);
  assert.match(ofCheck(at('t_uint256', {}), at(price, t(price, 'Price', { underlying: 't_int256' })), 'type-changed')[0].message, /another signedness/);
  const small = 't_userDefinedValueType(Small)8';
  assert.match(ofCheck(at('t_uint256', {}), at(small, { [small]: { encoding: 'inplace', label: 'Small', numberOfBytes: '8' } }), 'type-changed')[0].message, /the size changes from 32 bytes to 8 bytes/);
});

test('variable-inserted: a new variable that takes the storage of an old one; not one appended, packed into free bytes or in its own gap', () => {
  const old = { storage: [item('a', 't_uint128', 0), item('b', 't_uint256', 1)] };
  const before = { storage: [item('n', 't_uint256', 0), item('a', 't_uint128', 1), item('b', 't_uint256', 2)] };
  const f = ofCheck(old, before, 'variable-inserted');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /C\.n is new and sits at slot 0, offset 0, where the old layout keeps C\.a/);
  assert.deepEqual(idsOf(old, { storage: [...old.storage, item('c', 't_uint256', 2)] }), []);
  assert.deepEqual(idsOf(old, { storage: [item('a', 't_uint128', 0), item('free', 't_uint64', 0, 16), item('b', 't_uint256', 1)] }), [], 'free bytes of a slot');
  const removedLast = { storage: [item('a', 't_uint128', 0)] };
  assert.deepEqual(idsOf(old, { storage: [item('a', 't_uint128', 0), item('c', 't_bool', 1)] }).sort(), ['variable-inserted', 'variable-removed'], 'the slot of a removed variable is not free');
  assert.deepEqual(idsOf(old, removedLast), ['variable-removed']);
});

test('gap-mismatch: a gap that is not cut by the slots the new variables take, counting packing', () => {
  const old = { storage: [item('owner', 't_address', 0, 0, A), item('__gap', 't_array(t_uint256)49_storage', 1, 0, A), item('x', 't_uint256', 50, 0, B)] };
  const right = { storage: [item('owner', 't_address', 0, 0, A), item('admin', 't_address', 1, 0, A), item('__gap', 't_array(t_uint256)48_storage', 2, 0, A), item('x', 't_uint256', 50, 0, B)] };
  assert.deepEqual(idsOf(old, right), []);
  const notCut = { storage: [item('owner', 't_address', 0, 0, A), item('admin', 't_address', 1, 0, A), item('__gap', 't_array(t_uint256)49_storage', 2, 0, A), item('x', 't_uint256', 51, 0, B)] };
  const f = ofCheck(old, notCut, 'gap-mismatch');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /The gap A\.__gap kept its 49 slots, while the variables of A before it take 1 more slot, so the variables after the gap move 1 slot further/);
  assert.deepEqual(idsOf(old, notCut).sort(), ['gap-mismatch', 'variable-moved']);
  const packed = { storage: [item('owner', 't_address', 0, 0, A), item('flag', 't_bool', 0, 20, A), item('__gap', 't_array(t_uint256)49_storage', 1, 0, A), item('x', 't_uint256', 50, 0, B)] };
  assert.deepEqual(idsOf(old, packed), [], 'a bool packed next to the address takes no slot');
  const cutTooMuch = { storage: [item('owner', 't_address', 0, 0, A), item('flag', 't_bool', 0, 20, A), item('__gap', 't_array(t_uint256)48_storage', 1, 0, A), item('x', 't_uint256', 49, 0, B)] };
  assert.match(ofCheck(old, cutTooMuch, 'gap-mismatch')[0].message, /had 49 slots and has 48 slots, while the variables of A before it take the same number of slots, so the variables after the gap move 1 slot back/);
  const named = { storage: [item('owner', 't_address', 0, 0, A), item('__gap_a', 't_array(t_uint256)49_storage', 1, 0, A)] };
  const namedCut = { storage: [item('owner', 't_address', 0, 0, A), item('__gap_a', 't_array(t_uint256)48_storage', 1, 0, A)] };
  assert.equal(ofCheck(named, namedCut, 'gap-mismatch').length, 1, 'a gap named __gap_ with a suffix is a gap');
});

test('gap-removed: a gap that is gone is a warning at the line of the old file; a kept gap is not', () => {
  const old = { storage: [item('owner', 't_address', 0, 0, A), item('__gap', 't_array(t_uint256)49_storage', 1, 0, A)] };
  const f = ofCheck(old, { storage: [item('owner', 't_address', 0, 0, A)] }, 'gap-removed');
  assert.equal(f.length, 1);
  assert.equal(f[0].side, 'old');
  assert.match(f[0].message, /The gap A\.__gap \(uint256\[49\]\) at slot 1, offset 0 is not in the new layout/);
  assert.match(f[0].message, /best practice of this tool/);
  assert.deepEqual(idsOf(old, old), []);
  assert.deepEqual(ofCheck(old, { storage: [item('owner', 't_address', 0, 0, A)] }, 'variable-removed'), [], 'a gap is not a removed variable');
});

test('inheritance-order-changed: base contracts in another order; not a new contract after the others', () => {
  const old = { storage: [item('a', 't_uint256', 0, 0, A), item('b', 't_uint256', 1, 0, B), item('c', 't_uint256', 2, 0, C)] };
  const swapped = { storage: [item('a', 't_uint256', 0, 0, A), item('c', 't_uint256', 1, 0, C), item('b', 't_uint256', 2, 0, B)] };
  const f = ofCheck(old, swapped, 'inheritance-order-changed');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /in the order A, B and C in the old layout and A, C and B in the new one/);
  assert.equal(f[0].line, lineOf(layoutText(swapped), '"label": "c"'));
  assert.deepEqual(ofCheck(old, { storage: [...old.storage, item('d', 't_uint256', 3, 0, D)] }, 'inheritance-order-changed'), []);
});

test('namespace-removed: a namespace that is gone; a new namespace and a kept one are not', () => {
  const ns = (spaces) => ({ storage: [item('a', 't_uint256', 0)], namespaces: spaces });
  const old = ns({ 'erc7201:x.main': [item('v', 't_uint256', 0)], 'erc7201:x.old': [item('w', 't_uint256', 0), item('z', 't_uint256', 1)] });
  const f = ofCheck(old, ns({ 'erc7201:x.main': [item('v', 't_uint256', 0)] }), 'namespace-removed');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /The namespace erc7201:x\.old of the old layout \(2 variables\) is not in the new one/);
  assert.equal(f[0].line, lineOf(layoutText(old), '"erc7201:x.old"'));
  assert.deepEqual(idsOf(old, ns({ 'erc7201:x.main': [item('v', 't_uint256', 0)], 'erc7201:x.old': [item('w', 't_uint256', 0), item('z', 't_uint256', 1)], 'erc7201:x.new': [item('n', 't_uint256', 0)] })), []);
});

test('namespaces follow the same rules as the ordinary layout, and their variables are named with the namespace', () => {
  const ns = (vars) => ({ storage: [], namespaces: { 'erc7201:x.main': vars } });
  const f = findingsOf(ns([item('v', 't_uint256', 0), item('w', 't_uint256', 1)]), ns([item('w', 't_uint256', 0)]));
  assert.deepEqual(f.map((x) => x.id).sort(), ['variable-moved', 'variable-removed']);
  assert.match(f.find((x) => x.id === 'variable-removed').message, /^v in namespace erc7201:x\.main \(uint256\)/);
  assert.doesNotMatch(f.find((x) => x.id === 'variable-removed').message, /constant/);
  assert.equal(nameOf({ space: '', contractName: '', label: 'v' }), 'v');
});

test('proxy-slot-overlap: a variable on an ERC-1967 slot, or an array over one; not a variable on the slot before', () => {
  const impl = ERC1967_SLOTS[0].slot;
  const at = (slot, type = 't_uint256') => ({ storage: [{ ...item('v', type, 0), slot: slot.toString() }] });
  const f = ofCheck({ storage: [] }, at(impl), 'proxy-slot-overlap');
  assert.equal(f.length, 1);
  assert.match(f[0].message, /takes slot 0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc, which ERC-1967 sets aside for the address of the logic contract/);
  assert.equal(ofCheck({ storage: [] }, at(impl - 1n), 'proxy-slot-overlap').length, 0);
  assert.equal(ofCheck({ storage: [] }, at(impl - 1n, 't_array(t_uint256)3_storage'), 'proxy-slot-overlap').length, 1);
  assert.equal(ofCheck({ storage: [] }, at(ERC1967_SLOTS[2].slot, 't_address'), 'proxy-slot-overlap').length, 1);
  assert.equal(slotText(118n), '118');
  assert.match(slotText(impl), /^0x3608/);
});

test('variable-renamed: a new name at the same place with the same storage form, or a declaration moved to another contract', () => {
  const f = ofCheck({ storage: [item('rate', 't_uint256', 0)] }, { storage: [item('ratePerSecond', 't_uint256', 0)] }, 'variable-renamed');
  assert.match(f[0].message, /C\.rate is renamed ratePerSecond at the same slot 0, offset 0/);
  const moved = ofCheck({ storage: [item('x', 't_uint256', 0, 0, A), item('y', 't_uint256', 1, 0, B)] }, { storage: [item('x', 't_uint256', 0, 0, A), item('y', 't_uint256', 1, 0, A)] }, 'variable-renamed');
  assert.match(moved[0].message, /y is now declared in A instead of B, at the same slot 1, offset 0/);
  assert.deepEqual(idsOf({ storage: [item('rate', 't_uint256', 0)] }, { storage: [item('other', 't_int256', 0)] }).sort(), ['variable-inserted', 'variable-removed'], 'another type at the place is not a rename');
});

test('a contract renamed between versions is followed, and --contract names the pair', () => {
  const old = { storage: [item('a', 't_uint256', 0, 0, 'src/Vault.sol:Vault')] };
  const renamed = { storage: [item('a', 't_uint256', 0, 0, 'src/VaultV2.sol:VaultV2')] };
  const r = checkTexts(layoutText(old), layoutText(renamed));
  assert.deepEqual(r.findings, []);
  assert.match(r.notes[0], /the contract Vault of the old layout is compared with VaultV2 of the new layout, the one contract name/);
  const named = checkTexts(layoutText(old), layoutText(renamed), { contract: ['Vault', 'VaultV2'] });
  assert.match(named.notes[0], /the contracts that were picked/);
});

test('layout-incomplete: a variable with no slot, a type that is not in types, a type with no size, a struct member with no offset', () => {
  const noSlot = { storage: [{ ...item('a', 't_uint256', 0), slot: undefined }] };
  const f = ofCheck({ storage: [] }, noSlot, 'layout-incomplete');
  assert.match(f[0].message, /The variable a in the storage list has no valid slot, so it was not compared/);
  const missing = ofCheck({ storage: [item('a', 't_nothing', 0)] }, { storage: [item('a', 't_nothing', 0)] }, 'layout-incomplete');
  assert.equal(missing.length, 2);
  assert.match(missing[0].message, /The type t_nothing is not in the types of the layout/);
  const sizeless = { storage: [item('a', 't_odd', 0)], types: { t_odd: { encoding: 'inplace', label: 'odd' } } };
  assert.match(ofCheck(sizeless, sizeless, 'layout-incomplete')[0].message, /The type t_odd has no numberOfBytes/);
  const badMember = { storage: [item('p', 't_struct(P)1_storage', 0)], types: { 't_struct(P)1_storage': { encoding: 'inplace', label: 'struct C.P', members: [{ label: 'x', slot: '0', type: 't_uint256' }], numberOfBytes: '32' } } };
  assert.match(ofCheck(badMember, badMember, 'layout-incomplete')[0].message, /The variable x in the members of struct C\.P has no valid offset/);
  const notObject = { storage: [item('a', 't_uint256', 0)], types: { t_uint256: 'uint256' } };
  assert.match(ofCheck(notObject, notObject, 'layout-incomplete')[0].message, /The type t_uint256 is not an object/);
  const noMembers = { storage: [item('p', 't_struct(P)1_storage', 0)], types: { 't_struct(P)1_storage': { encoding: 'inplace', label: 'struct C.P', numberOfBytes: '32' } } };
  assert.match(ofCheck(noMembers, noMembers, 'layout-incomplete')[0].message, /has no members/);
  const noKey = { storage: [item('m', 't_map', 0)], types: { t_map: { encoding: 'mapping', label: 'mapping', numberOfBytes: '32' } } };
  assert.match(ofCheck(noKey, noKey, 'layout-incomplete')[0].message, /has no key and value/);
});

test('layout-unreadable: text that is not JSON, JSON that is not a layout, a storage that is not a list, and an output with no layout', () => {
  const good = layoutText({ storage: [item('a', 't_uint256', 0)] });
  const unreadable = (text) => checkTexts(good, text).findings.filter((f) => f.id === 'layout-unreadable');
  assert.match(unreadable('{"storage": [}')[0].message, /The file is not JSON the reader can follow: expected a value and found "}" at line 1, column 14/);
  assert.match(unreadable('[1, 2]')[0].message, /holds no storage layout in a form the tool reads/);
  assert.match(unreadable('{"storage": {}}')[0].message, /has no storage list/);
  assert.match(unreadable('{"contracts": {"a.sol": {"A": {"abi": []}}}}')[0].message, /holds no storageLayout for any contract/);
  assert.match(unreadable('{"storageLayout": 3}')[0].message, /The storage layout is not an object/);
  const r = checkTexts('nope', good);
  assert.equal(r.findings[0].side, 'old');
  assert.match(r.notes[0], /the layouts were not compared/);
});
