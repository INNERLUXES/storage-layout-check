// Command line: storage-layout-check <old layout> <new layout> [--contract <name>[,<new name>]] [options]

import { readFileSync } from 'node:fs';
import { InputError, LIMITS, checkFiles } from './check.js';
import { LEVELS } from './data.js';
import { listChecksJson, listChecksMarkdown, listChecksText, toJson, toMarkdown, toSarif, toText } from './report.js';
import { RULES } from './rules.js';
import { safeText } from './text.js';

export const VERSION = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')).version;

const FORMATS = { text: toText, markdown: toMarkdown, json: toJson, sarif: toSarif };
const LISTS = { text: listChecksText, markdown: listChecksMarkdown, json: listChecksJson };

export const USAGE = `Usage: storage-layout-check <old layout> <new layout> [--contract <name>[,<new name>]] [options]

Compares the storage layout of two versions of an upgradeable Solidity contract and lists the changes that would corrupt
storage behind a proxy, before the upgrade is deployed: variables removed, moved, inserted before existing ones or given
another type (size, signedness, mapping key or value, struct members, array length, enum members), storage gaps cut by
the wrong number of slots or removed, base contracts in another order, ERC-7201 namespaces removed, and variables on the
ERC-1967 proxy slots, with renamed variables and types as notes. A layout file is the storageLayout output of the
compiler, of forge inspect <contract> storageLayout --json or of an artifact, or a compiler output with several contracts.
It reads the two files and is not an audit: it compiles nothing, runs nothing, fetches nothing, reads no clock and writes
nothing to disk.

Options:
  --contract <name>         the contract to take from a compiler output with several contracts, as Name or path:Name;
                            <old>,<new> names one for each file when the name changed between versions
  --format <name>           text, markdown, json or sarif (default: text)
  --json                    the same as --format json
  --min-severity <level>    the lowest level of a finding that is shown: ${LEVELS.join(', ')} (default: info)
  --fail-on <level>         the lowest level of a finding that fails the run: ${LEVELS.join(', ')} (default: error)
  --explain                 show the points of the documentation behind each finding (text, markdown and JSON)
  --list-checks             list the checks with their level and kind, and exit
  --help                    show this text
  --version                 show the version

Checks: ${RULES.map((r) => r.id).join(', ')}.

Exit codes: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
`;

const isUrl = (f) => /^[a-z][a-z0-9+.-]*:\/\//i.test(f);

// The --contract value: one name for both files, or <old>,<new>.
function contractsOf(value) {
  if (value === null) return [null, null];
  const parts = value.split(',');
  if (parts.length > 2 || parts.some((p) => p.trim() === '')) throw new Error('--contract takes a name, or two names as <old>,<new>');
  return parts.length === 1 ? [parts[0].trim(), parts[0].trim()] : [parts[0].trim(), parts[1].trim()];
}

export function parseArgs(argv) {
  const o = { paths: [], contract: null, format: null, json: false, minSeverity: null, failOn: null, explain: false, listChecks: false, help: false, version: false };
  const once = (name, current, value) => {
    if (current !== null) throw new Error(`${name} was given twice`);
    return value;
  };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    const next = () => {
      const v = argv[i + 1];
      if (v === undefined || (v.startsWith('--') && v.length > 2)) throw new Error(`${a} needs a value`);
      if (v === '-') throw new Error('reading from standard input is not supported; give two files');
      i += 1;
      return v;
    };
    if (a === '--help' || a === '-h') o.help = true;
    else if (a === '--version' || a === '-v') o.version = true;
    else if (a === '--explain') o.explain = true;
    else if (a === '--json') o.json = true;
    else if (a === '--list-checks') o.listChecks = true;
    else if (a === '--contract') o.contract = once(a, o.contract, next());
    else if (a === '--format') o.format = once(a, o.format, next());
    else if (a === '--min-severity') o.minSeverity = once(a, o.minSeverity, next());
    else if (a === '--fail-on') o.failOn = once(a, o.failOn, next());
    else if (a === '-') throw new Error('reading from standard input is not supported; give two files');
    else if (a.startsWith('-')) throw new Error(`unknown argument ${a}`);
    else {
      if (o.paths.length === 2) throw new Error('give two files, the old layout and the new one');
      o.paths.push(a);
    }
  }
  if (o.json) {
    if (o.format !== null && o.format !== 'json') throw new Error(`--json and --format ${o.format} ask for two formats; give one`);
    o.format = 'json';
  }
  if (o.format === null) o.format = 'text';
  if (!Object.hasOwn(FORMATS, o.format)) throw new Error(`unknown format ${o.format} (text, markdown, json or sarif)`);
  for (const [flag, v] of [['--min-severity', o.minSeverity], ['--fail-on', o.failOn]]) if (v !== null && !LEVELS.includes(v)) throw new Error(`${flag}: unknown level ${v} (${LEVELS.join(', ')})`);
  if (o.listChecks && o.format === 'sarif') throw new Error('--list-checks has no SARIF form; use text, markdown or json');
  o.contracts = contractsOf(o.contract);
  if (!o.help && !o.version && !o.listChecks) {
    if (o.paths.length !== 2) throw new Error('give two files, the old layout and the new one, such as storage-layout-check v1.json v2.json');
    if (o.paths.some(isUrl)) throw new Error('give local paths; the tool never fetches a URL');
    if (o.explain && o.format === 'sarif') throw new Error('--explain adds the documentation points to the text, markdown and JSON reports; the sarif format has no place for them');
  }
  return o;
}

const clean = (text) => safeText(text, 1500);

// Exit code: 0 no finding at or above the fail-on level, 1 a finding at or above it, 2 usage or input error.
export async function main(argv, io = { out: (t) => process.stdout.write(t), err: (t) => process.stderr.write(t) }, limits = undefined, base = process.cwd()) {
  let o;
  try {
    o = parseArgs(argv);
  } catch (error) {
    io.err(`storage-layout-check: ${clean(error.message)}\n\n${USAGE}`);
    return 2;
  }
  if (o.help) {
    io.out(USAGE);
    return 0;
  }
  if (o.version) {
    io.out(`${VERSION}\n`);
    return 0;
  }
  if (o.listChecks) {
    io.out(LISTS[o.format]());
    return 0;
  }
  let report;
  try {
    report = await checkFiles({ oldPath: o.paths[0], newPath: o.paths[1], contract: o.contracts, minSeverity: o.minSeverity ?? 'info', failOn: o.failOn ?? 'error', version: VERSION, limits: { ...LIMITS, ...(limits ?? {}) }, base });
  } catch (error) {
    if (error instanceof InputError) io.err(`storage-layout-check: no result, the input has ${error.problems.length === 1 ? 'a problem' : 'problems'}:\n${error.problems.map((p) => `  ${clean(p)}`).join('\n')}\n`);
    else io.err(`storage-layout-check: ${clean(error.message)}\n`);
    return 2;
  }
  io.out(FORMATS[o.format](report, { explain: o.explain }));
  return report.result.pass ? 0 : 1;
}
