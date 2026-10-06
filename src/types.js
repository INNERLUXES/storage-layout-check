// The types of a layout and how two of them compare. The compiler names a type by an id such as t_uint256,
// t_mapping(t_address,t_uint256) or t_struct(Position)41_storage, and the types object of the layout gives its label,
// encoding, size, and the key, value, base or members where it has them. The number in a struct or enum id is the id of a
// node of the syntax tree and changes from one build to the next, so two types are compared by what they hold and never
// by their ids.

export const TYPE_LIMITS = { maxDepth: 64, maxIdLength: 4000 };

// Splits a type id into the text before its first parenthesis, the ids inside it (split at the commas of the first level)
// and the text after it: t_array(t_uint256)3_storage is { head: 't_array', args: ['t_uint256'], tail: '3_storage' }. A
// type id with no parenthesis, or with parentheses that are not closed, has no args.
export function parseTypeId(id) {
  const open = id.indexOf('(');
  if (open < 0) return { head: id, args: [], tail: '' };
  const args = [];
  let depth = 0;
  let start = open + 1;
  for (let i = open; i < id.length; i += 1) {
    const c = id[i];
    if (c === '(') depth += 1;
    else if (c === ')') {
      depth -= 1;
      if (depth === 0) {
        args.push(id.slice(start, i));
        return { head: id.slice(0, open), args, tail: id.slice(i + 1) };
      }
    } else if (c === ',' && depth === 1) {
      args.push(id.slice(start, i));
      start = i + 1;
    }
  }
  return { head: id, args: [], tail: '' };
}

const INT = /^(u?)int([0-9]+)$/;
const STATIC_LENGTH = /^([0-9]+)_/;
const LABEL_LENGTH = /\[([0-9]+)\]$/;

// The kind of a type, from its id and its entry: mapping, dynamic_array, static_array, struct, enum, udvt (a
// user-defined value type), bytes (bytes and string, which the compiler encodes the same way), address (address,
// address payable and contract types, which all hold an address) or value (every other value type).
export function kindOf(id, encoding, hasStructMembers) {
  if (id.startsWith('t_mapping(') || encoding === 'mapping') return 'mapping';
  if (id.startsWith('t_array(')) return encoding === 'dynamic_array' || parseTypeId(id).tail.startsWith('dyn') ? 'dynamic_array' : 'static_array';
  if (encoding === 'dynamic_array') return 'dynamic_array';
  if (id.startsWith('t_struct(') || hasStructMembers) return 'struct';
  if (id.startsWith('t_enum(')) return 'enum';
  if (id.startsWith('t_userDefinedValueType(')) return 'udvt';
  if (encoding === 'bytes' || /^t_(?:string|bytes)_(?:storage|memory|calldata)/.test(id)) return 'bytes';
  if (id === 't_address' || id === 't_address_payable' || id.startsWith('t_contract(')) return 'address';
  return 'value';
}

const SAME = { verdict: 'same', reason: '' };
const RANK = { same: 0, renamed: 1, extended: 2, unknown: 3, changed: 4 };

// The worse of two results: changed over unknown over extended over renamed over same.
export function worse(a, b) {
  return RANK[b.verdict] > RANK[a.verdict] ? b : a;
}

const changed = (reason) => ({ verdict: 'changed', reason });
const bytesText = (n) => `${n} ${n === 1n ? 'byte' : 'bytes'}`;

// Compares the type oldId of the old layout with newId of the new one. oldTypes and newTypes describe the ids of each
// side (src/layout.js). The context says where the type sits: 'variable', 'member' of a struct, 'element' of an array,
// 'key' or 'mapping-value' of a mapping; appended struct members are safe only in a mapping value or within the old size.
// The result is { verdict, reason }: same, renamed (another name for the same storage form), extended (members appended,
// what was stored keeps its place), changed (another storage form), or unknown (the layout does not say enough). The
// recursion stops at TYPE_LIMITS.maxDepth, and a pair of types already being compared is taken as the same, so a struct
// that refers to itself through a mapping ends.
export function compareTypes(oldTypes, oldId, newTypes, newId, context = 'variable', depth = 0, seen = new Set()) {
  if (depth > TYPE_LIMITS.maxDepth) return { verdict: 'unknown', reason: `the types are nested more than ${TYPE_LIMITS.maxDepth} deep` };
  const pair = `${oldId}\u0000${newId}\u0000${context}`;
  if (seen.has(pair)) return SAME;
  seen.add(pair);
  const a = oldTypes.describe(oldId);
  const b = newTypes.describe(newId);
  if (!a || !b || a.incomplete || b.incomplete) return { verdict: 'unknown', reason: 'the layout does not describe a type well enough to compare it' };
  const sub = (x, y, ctx) => (x === null || y === null ? { verdict: 'unknown', reason: 'the layout does not name an inner type' } : compareTypes(oldTypes, x, newTypes, y, ctx, depth + 1, seen));
  const renamedIf = () => (a.label === b.label ? SAME : { verdict: 'renamed', reason: `${a.label} is now ${b.label}, with the same storage form` });

  if (a.kind === 'udvt' || b.kind === 'udvt') {
    const x = a.kind === 'udvt' ? a.underlying : oldId;
    const y = b.kind === 'udvt' ? b.underlying : newId;
    if (x !== null && y !== null) {
      const r = sub(x, y, context);
      return r.verdict === 'same' ? renamedIf() : r;
    }
    if (a.bytes !== b.bytes) return changed(`${a.label} becomes ${b.label}: the size changes from ${bytesText(a.bytes)} to ${bytesText(b.bytes)}`);
    if (a.label === b.label) return SAME;
    return { verdict: 'renamed', reason: `${a.label} is now ${b.label}, of the same size; the layout does not name the type a user-defined value type wraps, so confirm it is the same` };
  }
  if (a.kind !== b.kind) return changed(`${a.label} becomes ${b.label}, a type with another storage form`);

  switch (a.kind) {
    case 'address':
    case 'bytes':
      return renamedIf();
    case 'value': {
      if (a.label === b.label) return SAME;
      if (a.bytes !== b.bytes) return changed(`${a.label} becomes ${b.label}: the size changes from ${bytesText(a.bytes)} to ${bytesText(b.bytes)}, so the variable and what is packed next to it are read at other bytes`);
      const ia = INT.exec(a.label);
      const ib = INT.exec(b.label);
      if (ia && ib && ia[2] === ib[2] && ia[1] !== ib[1]) return changed(`${a.label} becomes ${b.label}: the same size with another signedness, so a stored value is read as another number`);
      return changed(`${a.label} becomes ${b.label}: another type of the same size, so a stored value is read as another kind of value`);
    }
    case 'enum': {
      if (a.bytes !== b.bytes) return changed(`${a.label} becomes ${b.label}: the size changes from ${bytesText(a.bytes)} to ${bytesText(b.bytes)}`);
      if (a.enumMembers && b.enumMembers) {
        const kept = a.enumMembers.every((m, k) => b.enumMembers[k] === m);
        if (!kept) {
          const gone = a.enumMembers.filter((m) => !b.enumMembers.includes(m));
          return changed(gone.length
            ? `the members of ${a.label} change: ${gone.slice(0, 6).join(', ')} ${gone.length === 1 ? 'is' : 'are'} removed, so a stored number names another member or none`
            : `the members of ${a.label} are reordered, so a stored number names another member`);
        }
        if (b.enumMembers.length > a.enumMembers.length) {
          const added = b.enumMembers.slice(a.enumMembers.length);
          return worse({ verdict: 'extended', reason: `${added.slice(0, 6).join(', ')} ${added.length === 1 ? 'is' : 'are'} appended to ${b.label}, and the old members keep their numbers` }, renamedIf());
        }
      }
      return renamedIf();
    }
    case 'mapping': {
      const k = sub(a.key, b.key, 'key');
      if (k.verdict === 'changed') return changed(`the key type of the mapping changes: ${k.reason}, so stored entries are looked up under keys of another type`);
      const v = sub(a.value, b.value, 'mapping-value');
      if (v.verdict === 'changed') return changed(`the value type of the mapping changes: ${v.reason}`);
      return worse(worse(k, v), renamedIf());
    }
    case 'dynamic_array': {
      const e = sub(a.base, b.base, 'element');
      if (e.verdict === 'changed') return changed(`the element type of the array changes: ${e.reason}`);
      return worse(e, renamedIf());
    }
    case 'static_array': {
      if (a.length !== null && b.length !== null && a.length !== b.length) return changed(`${a.label} becomes ${b.label}: the length changes from ${a.length} to ${b.length}, so the array takes another number of slots`);
      if (a.bytes !== b.bytes) return changed(`${a.label} becomes ${b.label}: the size changes from ${bytesText(a.bytes)} to ${bytesText(b.bytes)}`);
      const e = sub(a.base, b.base, 'element');
      if (e.verdict === 'changed') return changed(`the element type of the array changes: ${e.reason}`);
      return worse(e, renamedIf());
    }
    case 'struct': {
      let result = renamedIf();
      const am = a.members ?? [];
      const bm = b.members ?? [];
      const byLabel = new Map(bm.map((m) => [m.label, m]));
      for (let k = 0; k < am.length; k += 1) {
        const x = am[k];
        const y = bm[k];
        const same = byLabel.get(x.label);
        // A member found under its name at another index has moved, as when a member is inserted before it.
        if (same && same !== y) return changed(`member ${x.label} of ${a.label} moves from slot ${x.slot}, offset ${x.offset} to slot ${same.slot}, offset ${same.offset} of the struct`);
        if (!y) return changed(`member ${x.label} of ${a.label} is removed`);
        if (x.slot !== y.slot || x.offset !== y.offset) return changed(`member ${x.label} of ${a.label} moves from slot ${x.slot}, offset ${x.offset} to slot ${y.slot}, offset ${y.offset} of the struct`);
        const r = sub(x.type, y.type, 'member');
        if (r.verdict === 'changed') return changed(x.label === y.label ? `member ${x.label} of ${a.label} changes: ${r.reason}` : `member ${x.label} of ${a.label} is replaced by ${y.label}: ${r.reason}`);
        result = worse(result, r);
        if (x.label !== y.label) result = worse(result, { verdict: 'renamed', reason: `member ${x.label} of ${a.label} is now ${y.label}` });
      }
      if (bm.length > am.length) {
        const added = bm.slice(am.length).map((m) => m.label);
        const list = `${added.slice(0, 6).join(', ')}${added.length > 6 ? ' and more' : ''}`;
        if (a.bytes === b.bytes) return worse(result, { verdict: 'extended', reason: `${list} ${added.length === 1 ? 'is' : 'are'} appended to ${b.label} within its old size of ${bytesText(a.bytes)}` });
        if (context === 'mapping-value') return worse(result, { verdict: 'extended', reason: `${list} ${added.length === 1 ? 'is' : 'are'} appended to ${b.label}, which is stored as the value of a mapping, so each entry grows at its own hashed slot` });
        return changed(`${list} ${added.length === 1 ? 'is' : 'are'} appended to ${b.label}, which grows from ${bytesText(a.bytes)} to ${bytesText(b.bytes)} where it is stored in sequence, so what follows it moves`);
      }
      return result;
    }
    default:
      return renamedIf();
  }
}
