// Runs the README examples, checks that they report what the README shows, and writes the reports of the two made-up
// upgrades to examples/output. CI runs it and then fails if those files changed, so the example output in the repository
// is always the real output.

import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { main } from '../src/index.js';

const root = resolve(fileURLToPath(import.meta.url), '..', '..');

// The arguments of the examples; every path is relative to the root of the repository.
export const BAD = ['examples/v1/layout.json', 'examples/v2-bad/layout.json'];
export const GOOD = ['examples/v1/layout.json', 'examples/v2-good/layout.json'];

// Runs the tool on files of the repository; the paths shown in the report are relative to the root of the repository.
export async function run(argv, base = root) {
  let out = '';
  let err = '';
  const code = await main(argv, { out: (t) => { out += t; }, err: (t) => { err += t; } }, undefined, base);
  return { code, out, err };
}

// What the README says of the bad upgrade: the counts, a finding of nearly every check, and the result.
export const EXPECTED = [
  'old: 327 lines, 7,604 bytes, a storage layout; 15 variables in 4 contracts, 5 variables in 2 namespaces',
  'new: 324 lines, 7,584 bytes, a storage layout; 16 variables in 4 contracts, 4 variables in 1 namespace',
  'findings: 22 (20 error, 1 warning, 1 info)',
  'Vault.paused (bool) at slot 113, offset 0 is not in the new layout',
  'The namespace erc7201:example.vault.legacy of the old layout (1 variable) is not in the new one.',
  'in the old layout and AccessBase, ListBase, FeeBase and Vault in the new one',
  'ListBase.allowed moves from slot 100, offset 0 to slot 50, offset 0',
  'The gap FeeBase.__gap kept its 49 slots, while the variables of FeeBase before it take 1 more slot',
  'Vault.version is new and sits at slot 102, offset 0, where the old layout keeps ListBase.__gap',
  'the key type of the mapping changes: address becomes uint256',
  'member since of struct Vault.Position changes: uint64 becomes uint128',
  'the members of enum Vault.Mode change: Paused is removed',
  'uint256[3] becomes uint256[4]: the length changes from 3 to 4',
  'int128 becomes uint128: the same size with another signedness',
  'The gap ListBase.__gap (uint256[9]) at slot 101, offset 0 is not in the new layout',
  'rate in namespace erc7201:example.vault.rewards is renamed ratePerSecond',
  'not a security audit and not a guarantee that the upgrade is safe',
  'RESULT: FAIL - 20 findings at or above error (20 error, 1 warning, 1 info)'
];
// What must not be reported: the checks that need a file the example does not have, and a pass.
export const UNWANTED = ['ERROR    layout-unreadable', 'WARNING  layout-incomplete', 'ERROR    proxy-slot-overlap', 'RESULT: PASS'];

// What the README says of the good upgrade: only notes.
export const GOOD_EXPECTED = [
  'findings: 4 (4 info)',
  'Vault.note is renamed memo at the same slot 117, offset 0',
  'rewardDebt is appended to struct Vault.Position, which is stored as the value of a mapping',
  'Retired is appended to enum Vault.Mode, and the old members keep their numbers',
  'contract IERC20 is now address, with the same storage form',
  'RESULT: PASS - no finding at or above error (4 info)'
];

const problems = [];
function expect(name, result, code, expected, unwanted, stream = 'out') {
  const text = result[stream];
  const missing = expected.filter((e) => !text.includes(e));
  const wrong = unwanted.filter((e) => text.includes(e));
  if (result.code !== code || missing.length || wrong.length) {
    problems.push(`${name}: unexpected report (exit code ${result.code}, expected ${code}; missing: ${missing.join(' / ') || 'none'}; should not appear: ${wrong.join(' / ') || 'none'})${result.err ? `\n${result.err}` : ''}`);
  }
}

if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  const bad = await run(BAD);
  process.stdout.write(bad.out);
  expect('bad upgrade', bad, 1, EXPECTED, UNWANTED);

  const good = await run(GOOD);
  expect('good upgrade', good, 0, GOOD_EXPECTED, ['ERROR    ', 'WARNING  ', 'RESULT: FAIL']);
  // The good upgrade also passes when warnings fail the run, and fails only when notes do.
  expect('good, fail on warning', await run([...GOOD, '--fail-on', 'warning']), 0, ['RESULT: PASS - no finding at or above warning (4 info)'], []);
  expect('good, fail on info', await run([...GOOD, '--fail-on', 'info']), 1, ['RESULT: FAIL - 4 findings at or above info (4 info)'], []);
  // The bad upgrade with only the errors shown still counts the rest.
  expect('bad, errors only', await run([...BAD, '--min-severity', 'error']), 1, ['findings: 20 (20 error); 2 below error not shown'], ['WARNING  ', 'INFO     ']);
  // A file that is not there stops the run with no report.
  expect('missing file', await run(['examples/v1/layout.json', 'examples/v3/layout.json']), 2, ['examples/v3/layout.json: does not exist'], [], 'err');

  // The README shows the head of the report of the bad upgrade with its table of checks, one finding, and the end of the
  // report, and the end of the report of the good upgrade.
  const readme = (await readFile(resolve(root, 'README.md'), 'utf8')).split('\r\n').join('\n');
  const head = bad.out.split('\n').slice(0, 22).join('\n');
  if (!readme.includes(head)) problems.push('README: the head of the sample output of the bad upgrade differs from a real run');
  const lines = bad.out.split('\n');
  const at = lines.findIndex((l) => l.includes('type-changed') && l.includes('examples/v2-bad/layout.json:126'));
  const sample = lines.slice(at, at + 3).join('\n');
  if (at < 0 || !readme.includes(sample)) problems.push('README: the sample finding of the signedness change differs from a real run');
  const tail = bad.out.split('\n').slice(-8).join('\n');
  if (!readme.includes(tail)) problems.push('README: the tail of the sample output of the bad upgrade differs from a real run');
  const goodTail = good.out.split('\n').slice(-5).join('\n');
  if (!readme.includes(goodTail)) problems.push('README: the tail of the sample output of the good upgrade differs from a real run');

  await mkdir(resolve(root, 'examples/output'), { recursive: true });
  await writeFile(resolve(root, 'examples/output/bad.txt'), bad.out);
  await writeFile(resolve(root, 'examples/output/good.txt'), good.out);
  const outputs = [
    ['bad-explain.txt', [...BAD, '--explain'], 1],
    ['bad.md', [...BAD, '--format', 'markdown'], 1],
    ['bad-explain.md', [...BAD, '--format', 'markdown', '--explain'], 1],
    ['bad.json', [...BAD, '--json', '--explain'], 1],
    ['bad.sarif', [...BAD, '--format', 'sarif'], 1],
    ['good.md', [...GOOD, '--format', 'markdown'], 0],
    ['good.json', [...GOOD, '--json'], 0],
    ['good.sarif', [...GOOD, '--format', 'sarif'], 0],
    ['checks.txt', ['--list-checks'], 0],
    ['checks.json', ['--list-checks', '--format', 'json'], 0]
  ];
  for (const [name, args, code] of outputs) {
    const r = await run(args);
    if (r.code !== code) problems.push(`${name}: exit code ${r.code}, expected ${code}`);
    await writeFile(resolve(root, 'examples/output', name), r.out);
  }

  if (problems.length) {
    for (const p of problems) console.error(`example: ${p}`);
    process.exit(1);
  }
}
