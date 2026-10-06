// Finding the storage layout in a file and reading it. A file may hold the layout object the compiler writes
// ({ storage, types }, which is also what forge inspect <contract> storageLayout --json prints), an artifact that holds
// it under storageLayout, a standard JSON output of the compiler (contracts -> source file -> contract -> storageLayout)
// or a build info file that holds such an output under output. A layout may also carry a namespaces object of storage
// lists keyed by namespace id, as the layout format of OpenZeppelin Upgrades does for ERC-7201 namespaces.
//
// What the comparison needs and the file does not say (a variable with no slot, a type that is not in types) is kept as a
// problem with its line, shown as a layout-incomplete finding, and never taken for a value that is fine.

import { InputError } from './files.js';
import { isArray, isNumber, isObject, isString, valueOf } from './json.js';
import { safeText } from './text.js';
import { TYPE_LIMITS, kindOf, parseTypeId } from './types.js';

// A storage gap: a fixed-size array named __gap, or with a name that starts with __gap_.
export const isGap = (label) => label === '__gap' || label.startsWith('__gap_');

// The name of a contract from the contract field of a variable: src/Vault.sol:Vault is Vault.
export function contractName(contract) {
  const at = contract.lastIndexOf(':');
  return at < 0 ? contract : contract.slice(at + 1);
}

const clean = (t, max = 120) => safeText(t, max);
const DIGITS = /^[0-9]{1,80}$/;

// The layouts a file holds: { form, candidates: [{ name, path, node }] }. form is null when the file holds none of the
// forms the tool reads.
export function layoutsIn(root) {
  if (!isObject(root)) return { form: null, candidates: [] };
  if (valueOf(root, 'storage') !== undefined) return { form: 'layout', candidates: [{ name: null, path: null, node: root }] };
  const inArtifact = valueOf(root, 'storageLayout');
  if (inArtifact !== undefined) {
    const name = valueOf(root, 'contractName');
    return { form: 'artifact', candidates: [{ name: isString(name) ? name.value : null, path: null, node: inArtifact }] };
  }
  let contracts = valueOf(root, 'contracts');
  let form = 'standard-json';
  if (contracts === undefined && isObject(valueOf(root, 'output'))) {
    contracts = valueOf(valueOf(root, 'output'), 'contracts');
    form = 'build-info';
  }
  if (!isObject(contracts)) return { form: null, candidates: [] };
  const candidates = [];
  for (const file of contracts.entries) {
    if (!isObject(file.value)) continue;
    for (const c of file.value.entries) {
      const layout = valueOf(c.value, 'storageLayout');
      if (layout !== undefined) candidates.push({ name: c.key, path: file.key, node: layout });
    }
  }
  return { form, candidates };
}

// The one layout to compare: { node, name, form } or { error, line, column } when the file holds no layout. A file with
// several contracts needs --contract (a name, or a path and a name as path:Name); a name that is not in the file, or that
// matches two contracts, stops the run.
export function pickLayout(root, wanted = null, side = 'the file') {
  const { form, candidates } = layoutsIn(root);
  if (form === null) return { error: 'The file holds no storage layout in a form the tool reads: a layout object with storage and types, an artifact with storageLayout, or a compiler output with contracts. Nothing in the file was compared.', line: root.line, column: root.column };
  if (candidates.length === 0) return { error: 'The compiler output holds no storageLayout for any contract; ask for it in the output selection (storageLayout). Nothing in the file was compared.', line: root.line, column: root.column };
  if (form === 'layout' || form === 'artifact') return { node: candidates[0].node, name: candidates[0].name, form };
  const label = (c) => `${c.path}:${c.name}`;
  let found = candidates;
  if (wanted !== null) {
    found = wanted.includes(':') ? candidates.filter((c) => label(c) === wanted) : candidates.filter((c) => c.name === wanted);
    if (found.length === 0) throw new InputError([`${side}: no contract named ${clean(wanted)} with a storage layout; the contracts are ${candidates.slice(0, 20).map((c) => clean(label(c))).join(', ')}${candidates.length > 20 ? ` and ${candidates.length - 20} more` : ''}`]);
    if (found.length > 1) throw new InputError([`${side}: ${clean(wanted)} names ${found.length} contracts (${found.slice(0, 20).map((c) => clean(label(c))).join(', ')}); give path:Name`]);
  } else if (candidates.length > 1) {
    throw new InputError([`${side}: holds the storage layouts of ${candidates.length} contracts; pick one with --contract, such as --contract ${clean(candidates.at(-1).name)}; the contracts are ${candidates.slice(0, 20).map((c) => clean(label(c))).join(', ')}${candidates.length > 20 ? ` and ${candidates.length - 20} more` : ''}`]);
  }
  return { node: found[0].node, name: found[0].name, form };
}

// A slot as a BigInt: a string of decimal digits, as the compiler writes it, or a whole number. null when it is neither.
function slotOf(node) {
  if (isString(node) && DIGITS.test(node.value)) return BigInt(node.value);
  if (isNumber(node) && Number.isSafeInteger(node.value) && node.value >= 0) return BigInt(node.value);
  return null;
}

// A size in bytes as a BigInt, from numberOfBytes.
function bytesOf(node) {
  return slotOf(node);
}

// One variable of a storage list (or one member of a struct): { label, contract, contractName, slot, offset, type,
// line, column, space } or null with a problem.
function readItem(node, space, problems, where) {
  if (!isObject(node)) {
    problems.push({ line: node.line, column: node.column, message: `An entry of ${where} is not an object, so it was not compared.` });
    return null;
  }
  const label = valueOf(node, 'label');
  const type = valueOf(node, 'type');
  const slot = slotOf(valueOf(node, 'slot'));
  const offsetNode = valueOf(node, 'offset');
  const offset = isNumber(offsetNode) && Number.isInteger(offsetNode.value) && offsetNode.value >= 0 && offsetNode.value < 32 ? offsetNode.value : null;
  const contract = valueOf(node, 'contract');
  const missing = [];
  if (!isString(label) || label.value === '') missing.push('label');
  if (!isString(type) || type.value === '' || type.value.length > TYPE_LIMITS.maxIdLength) missing.push('type');
  if (slot === null) missing.push('slot');
  if (offset === null) missing.push('offset');
  const at = isString(label) ? label : node;
  if (missing.length) {
    const name = isString(label) && label.value !== '' ? clean(label.value) : `the entry at line ${node.line}`;
    problems.push({ line: at.line, column: at.column, message: `The variable ${name} in ${where} has no valid ${missing.join(', ')}, so it was not compared.` });
    return null;
  }
  const contractText = isString(contract) ? contract.value : '';
  return { label: label.value, contract: contractText, contractName: contractName(contractText), slot, offset, type: type.value, line: at.line, column: at.column, space };
}

// The types of a layout, described on demand by id. Problems with a type are recorded once, at the line of its entry or,
// for a type that is not in types, at the line of the first variable that uses it.
export class TypeTable {
  constructor(typesNode, problems) {
    this.entries = new Map();
    this.cache = new Map();
    this.problems = problems;
    this.reported = new Set();
    if (isObject(typesNode)) for (const e of typesNode.entries) this.entries.set(e.key, e);
  }

  problem(id, at, message) {
    if (this.reported.has(id)) return;
    this.reported.add(id);
    this.problems.push({ line: at.line, column: at.column, message });
  }

  // The type of a variable, with the place to name when the type is not in types.
  describeAt(id, at) {
    if (!this.entries.has(id)) {
      this.problem(id, at, `The type ${clean(id)} is not in the types of the layout, so the type of ${clean(at.label ?? 'a variable')} was not compared.`);
      return null;
    }
    return this.describe(id);
  }

  // { id, label, kind, bytes, key, value, base, length, members, enumMembers, underlying, incomplete } or null.
  describe(id) {
    if (this.cache.has(id)) return this.cache.get(id);
    const entry = this.entries.get(id);
    if (!entry || !isObject(entry.value)) {
      if (entry) this.problem(id, entry, `The type ${clean(id)} is not an object, so the variables of that type were not compared.`);
      this.cache.set(id, null);
      return null;
    }
    const node = entry.value;
    const str = (key) => {
      const v = valueOf(node, key);
      return isString(v) ? v.value : null;
    };
    const parsed = parseTypeId(id);
    const membersNode = valueOf(node, 'members');
    const structMembers = isArray(membersNode) && membersNode.items.length > 0 && isObject(membersNode.items[0]);
    const kind = kindOf(id, str('encoding'), structMembers);
    const bytes = bytesOf(valueOf(node, 'numberOfBytes'));
    const desc = { id, label: str('label') ?? id, kind, bytes, key: null, value: null, base: null, length: null, members: null, enumMembers: null, underlying: str('underlying'), incomplete: false };
    this.cache.set(id, desc);
    const missing = [];
    if (bytes === null) missing.push('numberOfBytes');
    if (kind === 'mapping') {
      desc.key = str('key') ?? parsed.args[0] ?? null;
      desc.value = str('value') ?? parsed.args[1] ?? null;
      if (desc.key === null || desc.value === null) missing.push('key and value');
    } else if (kind === 'dynamic_array' || kind === 'static_array') {
      desc.base = str('base') ?? parsed.args[0] ?? null;
      if (desc.base === null) missing.push('base');
      if (kind === 'static_array') {
        const m = STATIC.exec(parsed.tail) ?? LABEL.exec(desc.label);
        desc.length = m ? BigInt(m[1]) : null;
      }
    } else if (kind === 'struct') {
      if (!isArray(membersNode)) missing.push('members');
      else {
        desc.members = [];
        const memberProblems = [];
        for (const m of membersNode.items) {
          const item = readItem(m, '', memberProblems, `the members of ${clean(desc.label)}`);
          if (item) desc.members.push(item);
        }
        for (const p of memberProblems) this.problems.push(p);
        if (memberProblems.length) desc.incomplete = true;
      }
    } else if (kind === 'enum' && isArray(membersNode) && membersNode.items.every(isString)) {
      desc.enumMembers = membersNode.items.map((m) => m.value);
    }
    if (missing.length) {
      desc.incomplete = true;
      this.problem(id, entry, `The type ${clean(id)} has no ${missing.join(' and no ')}, so the variables of that type were not compared.`);
    }
    return desc;
  }
}

const STATIC = /^([0-9]+)_/;
const LABEL = /\[([0-9]+)\]$/;

// Reads a layout node: { spaces: [{ id, line, column, items }], types, problems } or { error, line, column } when it is not
// a layout. The first space, with the id '', is the ordinary storage of the contract; the others are its namespaces.
export function readLayout(node) {
  if (!isObject(node)) return { error: 'The storage layout is not an object. Nothing in the file was compared.', line: node.line, column: node.column };
  const storage = valueOf(node, 'storage');
  if (!isArray(storage)) return { error: 'The storage layout has no storage list. Nothing in the file was compared.', line: (storage ?? node).line, column: (storage ?? node).column };
  const problems = [];
  const types = new TypeTable(valueOf(node, 'types'), problems);
  const spaces = [{ id: '', line: storage.line, column: storage.column, items: storage.items.map((n) => readItem(n, '', problems, 'the storage list')).filter(Boolean) }];
  const namespaces = valueOf(node, 'namespaces');
  if (namespaces !== undefined && !isObject(namespaces)) problems.push({ line: namespaces.line, column: namespaces.column, message: 'The namespaces of the layout are not an object, so no namespace was compared.' });
  if (isObject(namespaces)) {
    for (const e of namespaces.entries) {
      if (!isArray(e.value)) {
        problems.push({ line: e.line, column: e.column, message: `The namespace ${clean(e.key)} is not a list of variables, so it was not compared.` });
        continue;
      }
      spaces.push({ id: e.key, line: e.line, column: e.column, items: e.value.items.map((n) => readItem(n, e.key, problems, `the namespace ${clean(e.key)}`)).filter(Boolean) });
    }
  }
  return { spaces, types, problems };
}
