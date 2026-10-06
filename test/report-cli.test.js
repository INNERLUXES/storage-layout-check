import { test } from 'node:test';
import assert from 'node:assert/strict';
import { RULES, USAGE, VERSION, decide, parseArgs, toSarif } from '../src/index.js';
import { NEW_BAD, NEW_GOOD, OLD, cli, item, layoutText, run } from './helpers.js';

const FILES = { 'v1.json': OLD, 'bad.json': NEW_BAD, 'good.json': NEW_GOOD };
const BAD = ['v1.json', 'bad.json'];
const GOOD = ['v1.json', 'good.json'];

test('exit codes: 0 for a pass, 1 for a finding at or above the fail-on level, 2 for a usage or input error', async () => {
  assert.equal((await run(FILES, GOOD)).code, 0);
  assert.equal((await run(FILES, BAD)).code, 1);
  assert.equal((await run(FILES, ['v1.json', 'nothing.json'])).code, 2);
  assert.equal((await run(FILES, ['v1.json'])).code, 2);
  assert.equal((await run(FILES, [])).code, 2);
  assert.equal((await run(FILES, [...BAD, '--bogus'])).code, 2);
});

test('--fail-on: a note fails the run at info and passes at warning and error', async () => {
  const renamed = layoutText({ storage: [item('owner', 't_address', 0), item('sum', 't_uint256', 1), item('limit', 't_int128', 2)] });
  const files = { 'v1.json': OLD, 'r.json': renamed };
  assert.equal((await run(files, ['v1.json', 'r.json'])).code, 0);
  assert.equal((await run(files, ['v1.json', 'r.json', '--fail-on', 'warning'])).code, 0);
  assert.equal((await run(files, ['v1.json', 'r.json', '--fail-on', 'info'])).code, 1);
  assert.equal((await run(FILES, [...GOOD, '--fail-on', 'info'])).code, 0, 'the good upgrade has no finding at any level');
});

test('--min-severity hides findings below it and says how many, and a hidden finding still counts for the result', async () => {
  const r = await run(FILES, [...BAD, '--min-severity', 'error']);
  assert.match(r.out, /findings: 2 \(2 error\)\n/);
  const info = await run({ 'v1.json': OLD, 'r.json': layoutText({ storage: [item('owner', 't_address', 0), item('sum', 't_uint256', 1), item('limit', 't_int128', 2)] }) }, ['v1.json', 'r.json', '--min-severity', 'warning', '--fail-on', 'info']);
  assert.match(info.out, /findings: 0; 1 below warning not shown/);
  assert.equal(info.code, 1);
});

test('the text report names both files, the checks table, each finding with its file and line and fix, and ends with the notice and the result', async () => {
  const r = await run(FILES, BAD);
  assert.match(r.out, /^storage-layout-check: v1\.json -> bad\.json\n/);
  assert.match(r.out, /\nold: \d+ lines, [\d,]+ bytes, a storage layout; 3 variables in 1 contract\n/);
  assert.match(r.out, /\nnew: \d+ lines, [\d,]+ bytes, a storage layout; 2 variables in 1 contract\n/);
  assert.match(r.out, /ERROR {4}variable-removed {11}v1\.json:\d+\n/);
  assert.match(r.out, /ERROR {4}variable-moved {13}bad\.json:\d+\n/);
  assert.match(r.out, /fix: Keep the variable at its place/);
  assert.match(r.out, /\nChecks \(14\)\n/);
  assert.match(r.out, /not a security audit and not a guarantee that the upgrade is safe\.\n\nRESULT: FAIL - 2 findings at or above error/);
  assert.ok(r.out.endsWith('\n'));
  assert.match((await run(FILES, GOOD)).out, /Findings \(0\)\n\n {2}none\n/);
});

test('--explain adds the points of the documentation with their pages to the text report', async () => {
  const r = await run(FILES, [...BAD, '--explain']);
  assert.match(r.out, /basis: .*\(Writing Upgradeable Contracts \(OpenZeppelin Upgrades Plugins documentation\), https:\/\/docs\.openzeppelin\.com\/upgrades-plugins\/writing-upgradeable\)/);
  assert.doesNotMatch((await run(FILES, BAD)).out, /basis:/);
  const best = await run({ 'a.json': layoutText({ storage: [item('t', 't_address', 0)] }), 'b.json': layoutText({ storage: [item('t', 't_contract(IToken)9', 0)] }) }, ['a.json', 'b.json', '--explain']);
  assert.match(best.out, /the tool's own choice: reading these types as one storage form/);
});

test('the JSON report has the id, severity, message, side, file, line and column of every finding', async () => {
  const report = JSON.parse((await run(FILES, [...BAD, '--json'])).out);
  assert.equal(report.tool, 'storage-layout-check');
  assert.equal(report.version, VERSION);
  assert.equal(report.input.old.file, 'v1.json');
  assert.equal(report.input.new.form, 'layout');
  const f = report.findings.find((x) => x.id === 'variable-removed');
  assert.equal(f.severity, 'error');
  assert.equal(f.side, 'old');
  assert.equal(f.file, 'v1.json');
  assert.equal(f.contract, 'C');
  assert.equal(f.variable, 'total');
  assert.equal(f.at, `v1.json:${f.line}`);
  assert.equal(typeof f.column, 'number');
  assert.equal(f.basis, undefined, 'the basis only with --explain');
  assert.ok(JSON.parse((await run(FILES, [...BAD, '--json', '--explain'])).out).findings[0].basis.length > 0);
  assert.equal(report.result.pass, false);
  assert.equal(report.rules.length, RULES.length);
});

test('--json and --format json are the same, and --json with another format is a usage error', async () => {
  assert.equal((await run(FILES, [...GOOD, '--json'])).out, (await run(FILES, [...GOOD, '--format', 'json'])).out);
  const r = await run(FILES, [...GOOD, '--json', '--format', 'text']);
  assert.equal(r.code, 2);
  assert.match(r.err, /two formats/);
});

test('the markdown report has a findings table and escapes what markdown gives a meaning to', async () => {
  const r = await run(FILES, [...BAD, '--format', 'markdown']);
  assert.match(r.out, /^# storage-layout-check: v1\.json -> bad\.json\n/);
  assert.match(r.out, /\| Level \| Check \| Where \| Message \|/);
  assert.match(r.out, /\| error \| variable-removed \| v1\.json:\d+ \|/);
  assert.match(r.out, /- Result: \*\*FAIL - 2 findings at or above error/);
  assert.match((await run(FILES, [...GOOD, '--format', 'markdown'])).out, /## Findings\n\nNone\./);
  const hostile = { 'a.json': layoutText({ storage: [item('[x](http://a.test)|<b>', 't_uint256', 0)] }), 'b.json': layoutText({}) };
  const out = (await run(hostile, ['a.json', 'b.json', '--format', 'markdown', '--explain'])).out;
  assert.ok(!out.includes('[x](http'), 'a link written in a variable name is escaped');
  assert.ok(out.includes('\\[x\\]\\(http'));
  assert.match(out, /## Basis\n\n### variable-removed\n/);
});

test('the SARIF report is SARIF 2.1.0 with the checks as rules, both files as artifacts, and a result for every finding', async () => {
  const sarif = JSON.parse((await run(FILES, [...BAD, '--format', 'sarif'])).out);
  assert.equal(sarif.version, '2.1.0');
  assert.match(sarif.$schema, /sarif-2\.1\.0/);
  const run0 = sarif.runs[0];
  assert.equal(run0.tool.driver.name, 'storage-layout-check');
  assert.equal(run0.tool.driver.rules.length, RULES.length);
  assert.deepEqual(run0.artifacts.map((a) => a.location.uri), ['v1.json', 'bad.json']);
  const removed = run0.results.find((x) => x.ruleId === 'variable-removed');
  assert.equal(removed.level, 'error');
  assert.equal(run0.tool.driver.rules[removed.ruleIndex].id, 'variable-removed');
  const loc = removed.locations[0].physicalLocation;
  assert.equal(loc.artifactLocation.uri, 'v1.json');
  assert.equal(loc.artifactLocation.index, 0);
  assert.ok(loc.region.startLine >= 1 && loc.region.startColumn >= 1);
  assert.equal(run0.results.find((x) => x.ruleId === 'variable-moved').locations[0].physicalLocation.artifactLocation.index, 1);
});

test('SARIF levels: error, warning and info are error, warning and note', async () => {
  const old = layoutText({ storage: [item('a', 't_uint256', 0, 0, 'src/A.sol:A'), item('__gap', 't_array(t_uint256)49_storage', 1, 0, 'src/A.sol:A'), item('t', 't_address', 50, 0, 'src/B.sol:B'), item('x', 't_uint256', 51, 0, 'src/B.sol:B')] });
  const neu = layoutText({ storage: [item('a', 't_uint256', 0, 0, 'src/A.sol:A'), item('t', 't_contract(IToken)9', 50, 0, 'src/B.sol:B')] });
  const sarif = JSON.parse((await run({ 'a.json': old, 'b.json': neu }, ['a.json', 'b.json', '--format', 'sarif'])).out);
  const levels = Object.fromEntries(sarif.runs[0].results.map((x) => [x.ruleId, x.level]));
  assert.equal(levels['variable-removed'], 'error');
  assert.equal(levels['gap-removed'], 'warning');
  assert.equal(levels['type-renamed'], 'note');
});

test('--explain has no place in the SARIF report and is a usage error there', async () => {
  const r = await run(FILES, [...GOOD, '--format', 'sarif', '--explain']);
  assert.equal(r.code, 2);
  assert.match(r.err, /sarif format has no place/);
});

test('--list-checks lists every check with its level and kind, in text, markdown and JSON, and needs no file', async () => {
  const text = await cli(['--list-checks'], process.cwd());
  assert.equal(text.code, 0);
  for (const r of RULES) assert.ok(text.out.includes(r.id), r.id);
  assert.match(text.out, /variable-removed +error +documented/);
  assert.match(text.out, /gap-removed +warning +best practice/);
  const md = await cli(['--list-checks', '--format', 'markdown'], process.cwd());
  assert.match(md.out, /\| variable-removed \| error \| documented \|/);
  const json = JSON.parse((await cli(['--list-checks', '--json'], process.cwd())).out);
  assert.equal(json.length, RULES.length);
  assert.equal((await cli(['--list-checks', '--format', 'sarif'], process.cwd())).code, 2);
});

test('--contract picks a contract of a compiler output, with one name or <old>,<new>; an unknown name is an input error', async () => {
  const layout = (label) => ({ storage: [item(label, 't_uint256', 0)], types: { t_uint256: { encoding: 'inplace', label: 'uint256', numberOfBytes: '32' } } });
  const output = JSON.stringify({ contracts: { 'src/V.sol': { V1: { storageLayout: layout('a') }, V2: { storageLayout: layout('b') } } } });
  const files = { 'out.json': output };
  const both = await run(files, ['out.json', 'out.json', '--contract', 'V1,V2']);
  assert.equal(both.code, 0, both.err);
  assert.match(both.out, /old: .*a compiler output \(contract V1\)/);
  assert.match(both.out, /variable-renamed/);
  assert.equal((await run(files, ['out.json', 'out.json', '--contract', 'src/V.sol:V1'])).code, 0);
  const none = await run(files, ['out.json', 'out.json']);
  assert.equal(none.code, 2);
  assert.match(none.err, /the old file: holds the storage layouts of 2 contracts; pick one with --contract/);
  const unknown = await run(files, ['out.json', 'out.json', '--contract', 'V1,Nope']);
  assert.equal(unknown.code, 2);
  assert.match(unknown.err, /the new file: no contract named Nope with a storage layout/);
});

test('--help, --version and usage errors', async () => {
  const help = await cli(['--help'], process.cwd());
  assert.equal(help.code, 0);
  assert.equal(help.out, USAGE);
  for (const option of ['--contract', '--format', '--json', '--min-severity', '--fail-on', '--explain', '--list-checks', '--help', '--version']) assert.ok(USAGE.includes(option), option);
  assert.equal((await cli(['--version'], process.cwd())).out, `${VERSION}\n`);
  for (const bad of [['a', 'b', 'c'], ['--format'], ['--format', 'xml', 'a', 'b'], ['--fail-on', 'high', 'a', 'b'], ['a', 'b', '--contract', 'x', '--contract', 'y'], ['https://example.test/a.json', 'b'], ['-'], ['a', 'b', '--contract', 'x,y,z'], ['a', 'b', '--contract', ',y']]) {
    const r = await cli(bad, process.cwd());
    assert.equal(r.code, 2, bad.join(' '));
    assert.match(r.err, /^storage-layout-check: /);
  }
});

test('parseArgs: values may not look like flags, a flag given twice is an error, and --contract gives a pair', () => {
  assert.throws(() => parseArgs(['a', 'b', '--contract', '--json']), /needs a value/);
  assert.throws(() => parseArgs(['a', 'b', '--format', 'json', '--format', 'text']), /given twice/);
  assert.throws(() => parseArgs(['a', 'b', '--format', '-']), /standard input/);
  assert.deepEqual(parseArgs(['a', 'b', '--contract', 'V']).contracts, ['V', 'V']);
  assert.deepEqual(parseArgs(['a', 'b', '--contract', 'V1,V2']).contracts, ['V1', 'V2']);
  assert.deepEqual(parseArgs(['a', 'b']).contracts, [null, null]);
});

test('decide: pass and fail texts, with the counts', () => {
  assert.equal(decide({ error: 0, warning: 0, info: 0 }, 'error').text, 'PASS - no finding at or above error');
  assert.equal(decide({ error: 0, warning: 2, info: 1 }, 'error').text, 'PASS - no finding at or above error (2 warning, 1 info)');
  assert.equal(decide({ error: 1, warning: 2, info: 1 }, 'error').text, 'FAIL - 1 finding at or above error (1 error, 2 warning, 1 info)');
  assert.equal(decide({ error: 1, warning: 2, info: 1 }, 'warning').text, 'FAIL - 3 findings at or above warning (1 error, 2 warning, 1 info)');
});

test('text from the files is cleaned: control characters, escapes and direction controls in a variable, a contract and a type', async () => {
  const bad = layoutText({ storage: [item('v\u001b[31m\u202e\u2028x', 't_\u0007odd', 0, 0, 'src/C.sol:C\u001b]0;t\u0007'), item('w', 't_uint256', 1, 0, 'src/C.sol:C\u001b]0;t\u0007')] });
  for (const format of ['text', 'markdown', 'json', 'sarif']) {
    const r = await run({ 'a.json': bad, 'b.json': layoutText({}) }, ['a.json', 'b.json', '--format', format]);
    assert.ok(![...r.out].some((c) => ['\u001b', '\u0007', '\u202e', '\u2028'].includes(c)), format);
  }
});

test('the same findings are written for LF, CRLF and CR line ends, and for UTF-16', async () => {
  const at = async (files) => JSON.parse((await run(files, [...BAD, '--json'])).out).findings.map((f) => `${f.id}:${f.side}:${f.line}:${f.column}`);
  const base = await at(FILES);
  assert.ok(base.length > 0);
  for (const sep of ['\r\n', '\r']) assert.deepEqual(await at({ 'v1.json': OLD.split('\n').join(sep), 'bad.json': NEW_BAD.split('\n').join(sep) }), base);
  const utf16 = (t) => Buffer.concat([Buffer.from([0xff, 0xfe]), Buffer.from(t, 'utf16le')]);
  assert.deepEqual(await at({ 'v1.json': utf16(OLD), 'bad.json': utf16(NEW_BAD) }), base);
});

test('toSarif is deterministic and the report object is the same for the same input', async () => {
  const a = (await run(FILES, [...BAD, '--format', 'sarif'])).out;
  const b = (await run(FILES, [...BAD, '--format', 'sarif'])).out;
  assert.equal(a, b);
  assert.equal(typeof toSarif, 'function');
});
