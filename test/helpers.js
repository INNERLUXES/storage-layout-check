// Shared test helpers: layouts built inline, compared in memory or written into a temporary folder that is removed after
// the test. Paths are built with resolve() from forward-slash names, so the same test runs on Linux, macOS and Windows. The
// line a test expects is found with lineOf(), which counts lines the way the reader does, so a test never holds a line
// number worked out by hand for one system only. No test reads the clock, the time zone or the locale.

import { mkdtemp, mkdir, writeFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, resolve } from 'node:path';
import { checkTexts, main } from '../src/index.js';

export async function withFiles(files, fn) {
  const dir = await mkdtemp(resolve(tmpdir(), 'storage-layout-check-'));
  try {
    for (const [rel, content] of Object.entries(files)) {
      await mkdir(dirname(resolve(dir, rel)), { recursive: true });
      await writeFile(resolve(dir, rel), content);
    }
    return await fn(dir);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}

// The line (from 1) of the n-th place where needle starts in text.
export function lineOf(text, needle, n = 1) {
  let at = -1;
  for (let i = 0; i < n; i += 1) {
    at = text.indexOf(needle, at + 1);
    if (at < 0) throw new Error(`${needle} is not in the text ${n} times`);
  }
  return text.slice(0, at).split('\n').length;
}

const value = (label, bytes) => ({ encoding: 'inplace', label, numberOfBytes: String(bytes) });
const mapping = (key, val, label) => ({ encoding: 'mapping', key, label, numberOfBytes: '32', value: val });
const array = (base, label, bytes) => ({ base, encoding: 'inplace', label, numberOfBytes: String(bytes) });

// The types most tests need, as the compiler writes them.
export const TYPES = {
  t_address: value('address', 20),
  t_address_payable: value('address payable', 20),
  t_bool: value('bool', 1),
  t_uint8: value('uint8', 1),
  t_uint16: value('uint16', 2),
  t_uint64: value('uint64', 8),
  t_uint128: value('uint128', 16),
  t_int128: value('int128', 16),
  t_uint256: value('uint256', 32),
  t_int256: value('int256', 32),
  t_bytes32: value('bytes32', 32),
  t_string_storage: { encoding: 'bytes', label: 'string', numberOfBytes: '32' },
  t_bytes_storage: { encoding: 'bytes', label: 'bytes', numberOfBytes: '32' },
  't_contract(IToken)9': value('contract IToken', 20),
  't_mapping(t_address,t_uint256)': mapping('t_address', 't_uint256', 'mapping(address => uint256)'),
  't_mapping(t_uint256,t_uint256)': mapping('t_uint256', 't_uint256', 'mapping(uint256 => uint256)'),
  't_mapping(t_address,t_int256)': mapping('t_address', 't_int256', 'mapping(address => int256)'),
  't_array(t_uint256)dyn_storage': { base: 't_uint256', encoding: 'dynamic_array', label: 'uint256[]', numberOfBytes: '32' },
  't_array(t_int256)dyn_storage': { base: 't_int256', encoding: 'dynamic_array', label: 'int256[]', numberOfBytes: '32' },
  't_array(t_uint256)3_storage': array('t_uint256', 'uint256[3]', 96),
  't_array(t_uint256)4_storage': array('t_uint256', 'uint256[4]', 128),
  't_array(t_uint256)50_storage': array('t_uint256', 'uint256[50]', 1600),
  't_array(t_uint256)49_storage': array('t_uint256', 'uint256[49]', 1568),
  't_array(t_uint256)48_storage': array('t_uint256', 'uint256[48]', 1536)
};

// A variable of a storage list.
export const item = (label, type, slot, offset = 0, contract = 'src/C.sol:C') => ({ astId: 1, contract, label, offset, slot: String(slot), type });

// A struct type with its members, each [label, type, slot, offset].
export function struct(label, members, bytes) {
  return { encoding: 'inplace', label, members: members.map(([l, t, s, o]) => item(l, t, s, o)), numberOfBytes: String(bytes) };
}

// The text of a layout: { storage, types, namespaces }, with TYPES added to the types.
export function layoutText({ storage = [], types = {}, namespaces } = {}) {
  return `${JSON.stringify({ storage, types: { ...TYPES, ...types }, ...(namespaces ? { namespaces } : {}) }, null, 2)}\n`;
}

// The findings of two layouts given as { storage, types, namespaces }, through the reader and the checks.
export const findingsOf = (oldLayout, newLayout, options) => checkTexts(layoutText(oldLayout), layoutText(newLayout), options).findings;

// The ids of the findings of two layouts.
export const idsOf = (oldLayout, newLayout, options) => findingsOf(oldLayout, newLayout, options).map((f) => f.id);

// The findings of one check.
export const ofCheck = (oldLayout, newLayout, id, options) => findingsOf(oldLayout, newLayout, options).filter((f) => f.id === id);

// Runs the command line with exactly these arguments, in a folder.
export async function cli(argv, base) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// Writes the files and runs the command line in the folder.
export async function run(files, args) {
  return withFiles(files, (dir) => cli(args, dir));
}

// A small upgrade: an old layout and a new one that removes a variable, for the command line tests.
export const OLD = layoutText({ storage: [item('owner', 't_address', 0), item('total', 't_uint256', 1), item('limit', 't_int128', 2)] });
export const NEW_BAD = layoutText({ storage: [item('owner', 't_address', 0), item('limit', 't_int128', 1)] });
export const NEW_GOOD = layoutText({ storage: [item('owner', 't_address', 0), item('total', 't_uint256', 1), item('limit', 't_int128', 2), item('cap', 't_uint256', 3)] });

// The time a hostile test may take: four times as long when the runner collects coverage, which sets NODE_V8_COVERAGE.
export const allowed = (ms) => (process.env.NODE_V8_COVERAGE ? ms * 4 : ms);
