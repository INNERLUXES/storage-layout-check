# storage-layout-check

Storage layout check. Give it the storage layout of two versions of an upgradeable Solidity contract: the one behind the
proxy now and the one that is to replace it. It reads the two files as the compiler, `forge inspect` or an artifact
writes them, compiles nothing and runs nothing, and lists the changes that would corrupt storage behind the proxy before
the upgrade is deployed: variables removed, moved, or inserted before existing ones; types changed in size, signedness,
mapping key or value, struct members, array length or enum members; storage gaps cut by the wrong number of slots or
removed; base contracts in another order; ERC-7201 namespaces removed; and variables on the ERC-1967 proxy slots, with
renamed variables and types as notes. Every finding has its id, level, message and file and line, and the run exits with
a code a pipeline can act on.

**It is an input to a review before an upgrade is deployed: not a security audit and not a guarantee that the upgrade is
safe.** It is not an auditor. It reads two files only: it compiles nothing, runs nothing, deploys nothing, fetches
nothing and reads no clock, so it does not see the code that is deployed, the proxy, the storage a contract writes with
assembly, or what the new code does with the values it reads; the checks are a heuristic. A clean run means only that
none of the changes of its checks were found between the two files, and the team still has to review the upgrade before
it is deployed.

Behind a proxy, an upgrade swaps the code and keeps the state, and the new code reads each variable where its own layout
says it is. The Solidity documentation describes how the compiler lays out state variables
(https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html), and the OpenZeppelin documentation lists what
a new version may not change (https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable). A variable declared
one line too early, a gap cut by one slot too few, or two base contracts swapped moves every variable after it, and the
contract keeps running with its values mixed up. Before an upgrade is proposed, the team needs the list: which
variables, which slots, which lines. This tool writes that list from the two layouts, on every change.

- **One check per change.** Fourteen checks, each with what it looks at, what it cannot see, the public pages it rests on
  and what to change. Each check is either documented (in the Solidity or OpenZeppelin documentation or in an ERC) or a
  best practice of this tool, and its message says which.
- **Types by what they hold.** Two types are compared by size, encoding, key, value, members and length, never by the
  ids of the syntax tree that change from build to build, so a struct rebuilt with the same members is the same struct.
- **Gaps by slots.** A gap must shrink by exactly the slots its contract gained, counting how the new variables pack.
- **A JSON reader of its own.** It keeps the line and column of every value, so a finding points at the line of the
  variable in the old or the new file; what a layout does not say is listed as a finding, never taken for a value that
  is fine.
- Reports as text, markdown, JSON and SARIF, with an exit code for a pipeline: `0` no finding at or above the
  `--fail-on` level, `1` a finding at or above it, `2` usage or input error.
- Plain JavaScript, no dependencies, no clock and no network.

```
npm test
```

```
tests 123
pass 121
fail 0
skipped 2
```

These are the summary lines that `npm test` prints at the end on Windows. The skipped tests are the ones that need a
symbolic link or a device (a link to a layout file, and `/dev/null` named as a file); they are guarded with
`process.platform`, run on Linux and macOS, and none of them asserts a line. `npm run test:coverage` runs the same tests
with coverage; their time limits are four times wider when coverage is on.

## Quick start

Requires Node 22 or newer. There is nothing to install.

```
git clone https://github.com/INNERLUXES/storage-layout-check.git
cd storage-layout-check
node bin/storage-layout-check.js examples/v1/layout.json examples/v2-bad/layout.json
```

Or without a clone, in your own project:

```
forge inspect src/Vault.sol:Vault storageLayout --json > layouts/Vault.v2.json
npx --yes github:INNERLUXES/storage-layout-check layouts/Vault.v1.json layouts/Vault.v2.json
```

`examples/` holds three layouts of a made-up vault with three base contracts and two ERC-7201 namespaces, in the form the
compiler writes with the namespaces and enum members that the OpenZeppelin layout format adds.
`examples/v2-bad/layout.json` holds a finding of nearly every check against `examples/v1/layout.json`: an address added
to a base contract with its gap left as it was, two base contracts swapped and the gap of one removed, a variable
inserted before the others, a variable removed, a mapping key, a struct member, an enum, an array length and a
signedness changed, a namespace removed and a variable renamed. `examples/v2-good/layout.json` passes at error and
warning level: its gaps are cut by the slots their contracts gained, new variables come after the last one, and the four
notes it still shows are a renamed variable, a contract type that became an address, a member appended to a struct
stored in a mapping and a member appended to an enum.

## Usage

```
storage-layout-check <old layout> <new layout> [--contract <name>[,<new name>]] [options]
```

```
--contract <name>         the contract to take from a compiler output with several contracts, as Name or path:Name;
                          <old>,<new> names one for each file when the name changed between versions
--format <name>           text, markdown, json or sarif (default: text)
--json                    the same as --format json
--min-severity <level>    the lowest level of a finding that is shown: info, warning, error (default: info)
--fail-on <level>         the lowest level of a finding that fails the run: info, warning, error (default: error)
--explain                 show the points of the documentation behind each finding (text, markdown and JSON)
--list-checks             list the checks with their level and kind, and exit
--help                    show the usage
--version                 show the version
```

Name two files: the layout of the version that is deployed, then the layout of the new one. Each may be the layout object
(`forge inspect <contract> storageLayout --json`), an artifact with `storageLayout`, or a compiler output or build info
file, with `--contract` to pick the contract. The path in the report is relative to the folder you run the command in,
with forward slashes on every system, followed by the line.

The report of the bad example starts with what was read, the findings in one line, and the checks with the number of
findings of each; then the findings, errors first, each with what to change:

```
storage-layout-check: examples/v1/layout.json -> examples/v2-bad/layout.json
old: 327 lines, 7,604 bytes, a storage layout; 15 variables in 4 contracts, 5 variables in 2 namespaces
new: 324 lines, 7,584 bytes, a storage layout; 16 variables in 4 contracts, 4 variables in 1 namespace
findings: 22 (20 error, 1 warning, 1 info)

Checks (14)

  check                      level    kind           findings
  layout-unreadable          error    input          0
  layout-incomplete          warning  input          0
  variable-removed           error    documented     1
  variable-moved             error    documented     10
  type-changed               error    documented     5
  variable-inserted          error    documented     1
  gap-mismatch               error    documented     1
  gap-removed                warning  best practice  1
  inheritance-order-changed  error    documented     1
  namespace-removed          error    documented     1
  proxy-slot-overlap         error    documented     0
  variable-renamed           info     documented     1
  type-renamed               info     best practice  0
  type-extended              info     best practice  0
```

A finding names its check, its level, the file and the line of the variable and what to change. With `--explain` it also
gives the points of the documentation behind it and, for a best practice check, the tool's own choice:

```
  ERROR    type-changed               examples/v2-bad/layout.json:126
           The type of Vault.limit changes: int128 becomes uint128: the same size with another signedness, so a stored value is read as another number.
           fix: Keep the old type; add a variable of the new type after the last one and move the data in an upgrade step.
```

The end of the report holds the notes, the notice and the result:

```

  INFO     variable-renamed           examples/v2-bad/layout.json:293
           rate in namespace erc7201:example.vault.rewards is renamed ratePerSecond at the same slot 0, offset 0 with the same storage form, so ratePerSecond starts with the value of rate.
           fix: Confirm that the variable means the same as before, since it starts with the old value.

This report is an input to a review before an upgrade is deployed: not a security audit and not a guarantee that the upgrade is safe.

RESULT: FAIL - 20 findings at or above error (20 error, 1 warning, 1 info)
```

The good example passes:

```
           fix: Confirm that the stored values mean the same under the new type.

This report is an input to a review before an upgrade is deployed: not a security audit and not a guarantee that the upgrade is safe.

RESULT: PASS - no finding at or above error (4 info)
```

## How the layouts are read

1. Each path is resolved against the folder you run the command in. A link, a folder, a device or a file over 16 MB is
   refused, and so is a file that is not UTF-8 (or UTF-16 with a byte order mark) or holds a null byte, with exit code
   `2` and no report.
2. The JSON reader of the tool reads each file with the line and column of every value. It reads strict JSON and refuses
   a key written twice in one object.
3. The layout is found in the file: the layout object, an artifact, a compiler output or a build info file. Its
   variables are read with their contract, label, slot, offset and type, and its types when a check needs them.
4. The variables of the two layouts are paired by contract and name, then by name alone, then by place and storage form
   for a rename. A contract renamed between versions (`Vault` and `VaultV2`) is followed when it is the one name that
   changed, or when `--contract <old>,<new>` names it.
5. What a layout does not say (a variable with no slot, a type that is not in the types) is a `layout-incomplete`
   finding, and that part is not compared. A file that is not a layout is one `layout-unreadable` finding, and the two
   layouts are not compared.

[docs/method.md](docs/method.md) says what each check reads, and [docs/inputs.md](docs/inputs.md) lists the forms and
how to get them from each tool.

## What it checks

| Check | Level | Kind | What it reports |
| --- | --- | --- | --- |
| `variable-removed` | error | documented | a variable of the old layout that is not in the new one, under its name or at its place |
| `variable-moved` | error | documented | a variable at another slot or offset |
| `type-changed` | error | documented | another size or signedness, another mapping key or value, other struct members, another array length, enum members removed or reordered |
| `variable-inserted` | error | documented | a new variable that takes storage an old variable used: declared before existing ones, or in a base contract with no room |
| `gap-mismatch` | error | documented | a gap (`__gap`, `__gap_*`) not cut by exactly the slots its contract gained, counting packing |
| `gap-removed` | warning | best practice | a contract that had a gap and has none |
| `inheritance-order-changed` | error | documented | the contracts that hold storage in another order |
| `namespace-removed` | error | documented | an ERC-7201 namespace of the old layout that is not in the new one |
| `proxy-slot-overlap` | error | documented | a variable on a slot ERC-1967 sets aside for the logic contract, the beacon or the admin |
| `variable-renamed` | info | documented | a new name, or a declaration in another contract, at the same place with the same storage form |
| `type-renamed` | info | best practice | the same storage form under another type name: a contract type and address, string and bytes, a user-defined value type |
| `type-extended` | info | best practice | members appended to a struct stored as a mapping value or within its old size, or to an enum |
| `layout-incomplete` | warning | input | a variable or a type the layout does not describe well enough; it was not compared |
| `layout-unreadable` | error | input | a file that is not JSON, or holds no storage layout |

A documented check rests on a page of the Solidity documentation, the OpenZeppelin Upgrades documentation or an ERC. A
best practice check is this tool's own choice, and its message says "a best practice of this tool, not a rule in the
Solidity or OpenZeppelin documentation". `--list-checks` shows the kind of each check. Three of the levels are worth a
word:

- `variable-removed` is an error even for the last variable: the OpenZeppelin page says its storage is not cleared and a
  variable added there later starts with the old value. Keep the declaration and stop using it.
- `variable-inserted` looks at bytes. A new variable that takes the bytes of an old one starts with its value, wherever
  it was declared; one placed after the last variable, or in bytes no variable used, is not reported.
- `type-renamed` and `type-extended` are notes. The storage keeps its place, but only the team knows whether the values
  still mean what the new code reads them as.

Constant and immutable variables are not in storage, and the compiler leaves them out of the layout; a state variable
turned into one is a removed variable.

## What is not checked

[docs/limits.md](docs/limits.md) lists what the tool cannot see. Among them: whether the old file is the layout of the
code that is deployed, the meaning of renamed variables and types, enum members when the layout does not list them, what
a user-defined value type wraps when the layout does not say, namespaces the layout does not hold and the root slot of a
namespace, storage written with assembly or by a library through a storage pointer, the proxy itself and its upgrade
function, initializers, and transient storage.

## Formats

`--format text` (the default) is for a terminal. `--format markdown` is a report for a job summary or a pull request, with
a table of findings. `--format json` writes every finding with its `id`, `severity`, `message`, `side`, `file`, `line`,
`column`, `contract`, `variable`, `namespace` and `fix`, and with `--explain` its points of the documentation.
`--format sarif` writes SARIF 2.1.0, with the checks as rules, both files as artifacts and a result for each finding with
its file, line and column, for code scanning. The saved output of the examples is in
[examples/output](examples/output).

## Exit codes

| Code | Meaning |
| --- | --- |
| `0` | no finding at or above the `--fail-on` level (default `error`) |
| `1` | a finding at or above it |
| `2` | a usage error, or an input error such as a path that does not exist, a link or a folder, a file that is not text or is too large, or a compiler output with several contracts and no `--contract`; there is no report |

Findings below `--min-severity` are not shown, and still count for the result.

## Limits

The tool reads two files; it fetches nothing and connects to nothing. A run reports the changes of docs/method.md that
the two files hold. [docs/limits.md](docs/limits.md) lists what it cannot see, with the size limits: 16 MB for a file,
objects and arrays nested up to 1,000 deep, 2,000,000 values, and types compared up to 64 levels deep.
[docs/threat-model.md](docs/threat-model.md) lists the risks of reading files from a pull request and their controls,
and [docs/secure-defaults.md](docs/secure-defaults.md) the defaults and how to run the tool in a pipeline.

## Architecture

Plain ES modules in `src/`, with no dependencies.

| File | Job |
| --- | --- |
| `src/cli.js` | the command line, the usage and the exit codes |
| `src/check.js` | reads the two files, finds the layouts, runs the checks and builds the report of the run |
| `src/files.js` | the bounded reading of a file by its byte order mark, with no link followed |
| `src/json.js` | the JSON reader: lines and columns, keys written twice, limits, a stack of its own |
| `src/layout.js` | the forms of a layout file, the choice of a contract, the variables, namespaces and types |
| `src/types.js` | the comparison of two types by what they hold |
| `src/compare.js` | the pairing of variables and the checks |
| `src/rules.js` | the checks, their levels and kinds, and the result |
| `src/report.js`, `src/text.js`, `src/size.js` | the text, markdown, JSON and SARIF output, the cleaning of text from the input and number formats |
| `src/data.js` | the public pages and the points the checks rest on, in this project's own words |
| `research/sources/` | text copies of the pages, as they were read |
| `tools/check.mjs`, `tools/example.mjs` | the repository checks, and the examples with their real output |

## Where the facts come from

The checks rest on the Solidity documentation, the OpenZeppelin Upgrades documentation and its layout format, ERC-1967
and ERC-7201, and the Foundry reference for `forge inspect`, nothing else. Each page was read before it was listed, a
text copy of it is kept in [research/sources](research/sources), and [research/sources.md](research/sources.md) has a
note on each. [docs/rules-and-sources.md](docs/rules-and-sources.md) lists every check with the points of the pages it
rests on, what it cannot see and what to change. Where a check is a best practice and not a rule in the documentation,
it says so.

- Layout of State Variables in Storage: https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html
- Using the Compiler: https://docs.soliditylang.org/en/latest/using-the-compiler.html
- Writing Upgradeable Contracts: https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable
- Proxy Upgrade Pattern: https://docs.openzeppelin.com/upgrades-plugins/proxies
- The layout format of OpenZeppelin Upgrades: https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/master/packages/core/src/storage/layout.ts
- ERC-1967, Proxy Storage Slots: https://eips.ethereum.org/EIPS/eip-1967
- ERC-7201, Namespaced Storage Layout: https://eips.ethereum.org/EIPS/eip-7201
- forge inspect: https://www.getfoundry.sh/reference/forge/inspect

## Background

An upgradeable contract keeps its state for as long as the proxy lives, and every new version has to read that state
where the old one left it. The layouts of the two versions are read side by side when a team prepares an upgrade, or
brings in engineers to build, extend or review its contracts. How such work is staffed and carried out is described on
the page [Smart Contract Development Services](https://innerluxes.dev/blockchain/smart-contracts-development).

## License

MIT
