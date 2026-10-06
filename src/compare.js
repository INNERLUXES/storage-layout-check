// The checks: the old layout against the new one. Variables are paired by contract and name, then by name alone when a
// declaration moved to another contract, then by place and storage form when a variable was renamed. A pair is checked
// for its place and its type, a variable of the old layout with no pair is removed, and a variable of the new layout with
// no pair is checked for the storage it takes. Gaps, the order of the base contracts, namespaces and the ERC-1967 slots
// have checks of their own. Every message names the variable as Contract.name, with the slot and offset where it matters.

import { contractName, isGap } from './layout.js';
import { listText } from './size.js';
import { safeText } from './text.js';
import { compareTypes } from './types.js';

const BEST = 'This is a best practice of this tool, not a rule in the Solidity or OpenZeppelin documentation.';

// The slots ERC-1967 sets aside for a proxy, with what each holds.
export const ERC1967_SLOTS = [
  { slot: BigInt('0x360894a13ba1a3210667c828492db98dca3e2076cc3735a920a3ca505d382bbc'), holds: 'address of the logic contract' },
  { slot: BigInt('0xa3f0ad74e5423aebfd80d3ef4346578335a9a72aeaee59ff6cb3582b35133d50'), holds: 'address of the beacon' },
  { slot: BigInt('0xb53127684a568b3173ae13b9f8a6016e243e63b6e8ee1178d6a717850b5d6103'), holds: 'address of the admin' }
];

const clean = (t, max = 120) => safeText(t, max);

// A slot as the report shows it: decimal while it is short, hexadecimal when it is a hashed slot.
export const slotText = (slot) => (slot < 10n ** 15n ? slot.toString() : `0x${slot.toString(16)}`);

// A variable as the report names it: Contract.name, or name in namespace id.
export function nameOf(item) {
  if (item.space !== '') return `${clean(item.label)} in namespace ${clean(item.space)}`;
  return item.contractName ? `${clean(item.contractName)}.${clean(item.label)}` : clean(item.label);
}

const placeOf = (item) => `slot ${slotText(item.slot)}, offset ${item.offset}`;
const count = (n, one, many = `${one}s`) => `${n} ${n === 1n || n === 1 ? one : many}`;
const ceilSlots = (bytes) => (bytes + 31n) / 32n;

// The contract names of the old layout read as other names in the new one: the pair given with --contract, or else the
// one name in each layout that the other does not have, which is how a contract renamed between versions (Vault and
// VaultV2) is followed. The map is from an old name to a new name.
export function contractMap(oldLayout, newLayout, names = null) {
  const map = new Map();
  const notes = [];
  const collect = (layout) => new Set(layout.spaces.flatMap((s) => s.items.map((i) => i.contractName)));
  const oldNames = collect(oldLayout);
  const newNames = collect(newLayout);
  if (names && names[0] !== null && names[1] !== null) {
    const a = contractName(names[0]);
    const b = contractName(names[1]);
    if (a !== b && oldNames.has(a)) {
      map.set(a, b);
      notes.push(`the contract ${clean(a)} of the old layout is compared with ${clean(b)} of the new layout, the contracts that were picked`);
      return { map, notes };
    }
  }
  const onlyOld = [...oldNames].filter((n) => !newNames.has(n));
  const onlyNew = [...newNames].filter((n) => !oldNames.has(n));
  if (onlyOld.length === 1 && onlyNew.length === 1 && onlyOld[0] !== '' && onlyNew[0] !== '') {
    map.set(onlyOld[0], onlyNew[0]);
    notes.push(`the contract ${clean(onlyOld[0])} of the old layout is compared with ${clean(onlyNew[0])} of the new layout, the one contract name in each layout that the other does not have`);
  }
  return { map, notes };
}

// The byte range [start, end) an item takes in its space, or null when its size is not known.
function rangeOf(item, types) {
  const desc = types.describe(item.type);
  if (!desc || desc.bytes === null) return null;
  const start = item.slot * 32n + BigInt(item.offset);
  return { start, end: start + (desc.bytes > 0n ? desc.bytes : 1n) };
}

// Pairs the variables of two spaces: [{ o, n, how }] with how 'name', 'declaration' or 'renamed', and the unpaired ones.
function pairItems(oldItems, newItems, mapped, oldTypes, newTypes) {
  const pairs = [];
  const usedNew = new Set();
  const usedOld = new Set();
  const pair = (o, n, how) => {
    pairs.push({ o, n, how });
    usedOld.add(o);
    usedNew.add(n);
  };
  const byKey = new Map();
  for (const n of newItems) {
    const key = `${n.contractName}\u0000${n.label}`;
    if (!byKey.has(key)) byKey.set(key, n);
  }
  for (const o of oldItems) {
    const n = byKey.get(`${mapped(o.contractName)}\u0000${o.label}`);
    if (n && !usedNew.has(n)) pair(o, n, 'name');
  }
  const byLabel = new Map();
  for (const n of newItems) {
    if (usedNew.has(n) || isGap(n.label)) continue;
    if (!byLabel.has(n.label)) byLabel.set(n.label, []);
    byLabel.get(n.label).push(n);
  }
  for (const o of oldItems) {
    if (usedOld.has(o) || isGap(o.label)) continue;
    const found = byLabel.get(o.label);
    if (found && found.length === 1 && !usedNew.has(found[0])) pair(o, found[0], 'declaration');
  }
  const byPlace = new Map();
  for (const n of newItems) {
    if (usedNew.has(n) || isGap(n.label)) continue;
    const key = `${n.slot}:${n.offset}`;
    if (!byPlace.has(key)) byPlace.set(key, []);
    byPlace.get(key).push(n);
  }
  for (const o of oldItems) {
    if (usedOld.has(o) || isGap(o.label)) continue;
    // A few candidates at one place at most: a layout has one variable at a place, and a file that has many is not read
    // pair by pair.
    for (const n of (byPlace.get(`${o.slot}:${o.offset}`) ?? []).slice(0, 8)) {
      if (usedNew.has(n)) continue;
      const r = compareTypes(oldTypes, o.type, newTypes, n.type);
      if (r.verdict === 'same' || r.verdict === 'renamed' || r.verdict === 'extended') {
        pair(o, n, 'renamed');
        break;
      }
    }
  }
  return { pairs, removed: oldItems.filter((o) => !usedOld.has(o)), added: newItems.filter((n) => !usedNew.has(n)) };
}

// The first slot of each contract in a space.
function startsOf(items) {
  const starts = new Map();
  for (const i of items) if (!starts.has(i.contractName) || i.slot < starts.get(i.contractName)) starts.set(i.contractName, i.slot);
  return starts;
}

const shift = (n) => (n > 0n ? `${count(n, 'slot')} further` : `${count(-n, 'slot')} back`);
const delta = (n) => (n === 0n ? 'the same number of slots' : n > 0n ? `${count(n, 'more slot')}` : `${count(-n, 'fewer slot')}`);

// Compares two layouts read by readLayout. names is the pair of --contract names, or null. Returns { findings, notes };
// a finding is { id, side ('old' or 'new'), line, column, message, contract, variable }.
export function compareLayouts(oldLayout, newLayout, { names = null } = {}) {
  const findings = [];
  const add = (id, side, at, message, item = null) => findings.push({ id, side, line: at.line, column: at.column, message, contract: item && item.space === '' && item.contractName ? clean(item.contractName) : null, variable: item ? clean(item.label) : null, namespace: item && item.space !== '' ? clean(item.space) : null });
  const { map, notes } = contractMap(oldLayout, newLayout, names);
  const mapped = (name) => map.get(name) ?? name;
  const oldTypes = oldLayout.types;
  const newTypes = newLayout.types;
  const newSpaces = new Map(newLayout.spaces.map((s) => [s.id, s]));

  for (const os of oldLayout.spaces) {
    const ns = newSpaces.get(os.id);
    if (!ns) {
      add('namespace-removed', 'old', os, `The namespace ${clean(os.id)} of the old layout (${count(os.items.length, 'variable')}) is not in the new one. Its values stay in storage, and a namespace with the same id added later starts with them.`);
      continue;
    }
    const { pairs, removed, added } = pairItems(os.items, ns.items, mapped, oldTypes, newTypes);
    const oldStarts = startsOf(os.items);
    const newStarts = startsOf(ns.items);

    for (const { o, n, how } of pairs) {
      if (isGap(o.label) && isGap(n.label)) {
        const go = oldTypes.describeAt(o.type, o);
        const gn = newTypes.describeAt(n.type, n);
        if (!go || !gn || go.bytes === null || gn.bytes === null) continue;
        const before = (n.slot - newStarts.get(n.contractName)) - (o.slot - oldStarts.get(o.contractName));
        const shrink = ceilSlots(go.bytes) - ceilSlots(gn.bytes);
        if (before !== shrink) {
          const size = shrink === 0n ? `kept its ${count(ceilSlots(go.bytes), 'slot')}` : `had ${count(ceilSlots(go.bytes), 'slot')} and has ${count(ceilSlots(gn.bytes), 'slot')}`;
          add('gap-mismatch', 'new', n, `The gap ${nameOf(n)} ${size}, while the variables of ${clean(n.contractName)} before it take ${delta(before)}, so the variables after the gap move ${shift(before - shrink)}. A gap shrinks by exactly the slots the new variables take.`, n);
        }
        continue;
      }
      const a = oldTypes.describeAt(o.type, o);
      const b = newTypes.describeAt(n.type, n);
      if (o.slot !== n.slot || o.offset !== n.offset) {
        add('variable-moved', 'new', n, `${nameOf(n)} moves from ${placeOf(o)} to ${placeOf(n)}, so after the upgrade it reads what the old version stored there and its old value is left behind.`, n);
      }
      if (how === 'renamed') {
        add('variable-renamed', 'new', n, `${nameOf(o)} is renamed ${clean(n.label)}${o.contractName !== n.contractName && mapped(o.contractName) !== n.contractName ? ` and declared in ${clean(n.contractName)}` : ''} at the same ${placeOf(n)} with the same storage form, so ${clean(n.label)} starts with the value of ${clean(o.label)}.`, n);
      } else if (how === 'declaration' && o.slot === n.slot && o.offset === n.offset) {
        add('variable-renamed', 'new', n, `${clean(n.label)} is now declared in ${clean(n.contractName)} instead of ${clean(o.contractName)}, at the same ${placeOf(n)}, so it keeps its value.`, n);
      }
      if (!a || !b) continue;
      const r = compareTypes(oldTypes, o.type, newTypes, n.type);
      if (r.verdict === 'changed') add('type-changed', 'new', n, `The type of ${nameOf(n)} changes: ${r.reason}.`, n);
      else if (r.verdict === 'renamed' && how !== 'renamed') add('type-renamed', 'new', n, `The type of ${nameOf(n)} keeps its storage form: ${r.reason}. ${BEST}`, n);
      else if (r.verdict === 'extended') add('type-extended', 'new', n, `The type of ${nameOf(n)} grows without moving what was stored: ${r.reason}. ${BEST}`, n);
      else if (r.verdict === 'unknown' && !a.incomplete && !b.incomplete) add('layout-incomplete', 'new', n, `The type of ${nameOf(n)} was not compared: ${r.reason}.`, n);
    }

    for (const o of removed) {
      const desc = oldTypes.describeAt(o.type, o);
      const typeText = desc ? ` (${clean(desc.label)})` : '';
      if (isGap(o.label)) {
        add('gap-removed', 'old', o, `The gap ${nameOf(o)}${typeText} at ${placeOf(o)} is not in the new layout, so ${clean(o.contractName)} has no room left for new variables that would not move the variables declared after it. ${BEST}`, o);
      } else {
        add('variable-removed', 'old', o, `${nameOf(o)}${typeText} at ${placeOf(o)} is not in the new layout, under its name or at its place. Its value stays in storage, and a variable that takes its place starts with that value.${o.space === '' ? ' A variable turned into a constant or an immutable leaves storage too.' : ''}`, o);
      }
    }

    // The byte ranges of the old variables, sorted by start, with the greatest end so far, so that the variables that a new
    // variable overlaps are found without comparing every pair.
    const ranges = os.items.map((o) => ({ o, r: rangeOf(o, oldTypes) })).filter((x) => x.r !== null).sort((x, y) => (x.r.start < y.r.start ? -1 : x.r.start > y.r.start ? 1 : 0));
    const maxEnd = [];
    for (const [k, x] of ranges.entries()) maxEnd.push(k === 0 || x.r.end > maxEnd[k - 1] ? x.r.end : maxEnd[k - 1]);
    for (const n of added) {
      if (!newTypes.describeAt(n.type, n)) continue;
      const r = rangeOf(n, newTypes);
      if (r === null) continue;
      let lo = 0;
      let hi = ranges.length - 1;
      let last = -1;
      while (lo <= hi) {
        const mid = (lo + hi) >> 1;
        if (ranges[mid].r.start < r.end) {
          last = mid;
          lo = mid + 1;
        } else hi = mid - 1;
      }
      let hit = null;
      for (let k = last; k >= 0 && maxEnd[k] > r.start; k -= 1) {
        const { o, r: or } = ranges[k];
        if (or.end <= r.start) continue;
        if (isGap(o.label) && mapped(o.contractName) === n.contractName) continue;
        hit = o;
        break;
      }
      if (hit) add('variable-inserted', 'new', n, `${nameOf(n)} is new and sits at ${placeOf(n)}, where the old layout keeps ${nameOf(hit)}, so it starts with the value stored there. New variables go after the last one, or into the gap of their own contract.`, n);
    }
  }

  // The order of the base contracts that hold storage, in the ordinary storage of each layout.
  const main = (layout) => layout.spaces.find((s) => s.id === '');
  const orderOf = (items, f) => {
    const seen = new Set();
    const order = [];
    const sorted = [...items].sort((x, y) => (x.slot < y.slot ? -1 : x.slot > y.slot ? 1 : x.offset - y.offset));
    for (const i of sorted) {
      const name = f(i.contractName);
      if (!seen.has(name)) {
        seen.add(name);
        order.push(name);
      }
    }
    return order;
  };
  const oldMain = main(oldLayout);
  const newMain = main(newLayout);
  const oldOrder = orderOf(oldMain.items, mapped);
  const newOrder = orderOf(newMain.items, (n) => n);
  const oldSet = new Set(oldOrder);
  const newSet = new Set(newOrder);
  const oldCommon = oldOrder.filter((n) => newSet.has(n));
  const newCommon = newOrder.filter((n) => oldSet.has(n));
  const differs = oldCommon.findIndex((n, k) => newCommon[k] !== n);
  if (differs >= 0) {
    const first = newMain.items.find((i) => i.contractName === newCommon[differs]);
    add('inheritance-order-changed', 'new', first, `The contracts that hold storage come in the order ${listText(oldCommon.map((n) => clean(n)), 12)} in the old layout and ${listText(newCommon.map((n) => clean(n)), 12)} in the new one. Their variables are laid out in the order of the base contracts, so the variables of the contracts that changed place move.`, first);
  }

  // The ERC-1967 slots in the ordinary storage of the new layout.
  for (const n of newMain.items) {
    const desc = newTypes.describe(n.type);
    const span = desc && desc.bytes !== null ? ceilSlots(BigInt(n.offset) + desc.bytes) : 1n;
    for (const s of ERC1967_SLOTS) {
      if (n.slot <= s.slot && s.slot < n.slot + (span > 0n ? span : 1n)) add('proxy-slot-overlap', 'new', n, `${nameOf(n)} takes slot ${slotText(s.slot)}, which ERC-1967 sets aside for the ${s.holds} of a proxy, so writing the variable overwrites what the proxy keeps there.`, n);
    }
  }

  return { findings, notes };
}
