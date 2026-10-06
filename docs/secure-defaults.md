# Secure defaults

The default run is the safe run. Nothing in the first section needs a flag, and none of it can be switched off. The rest
of the document is about what the tool cannot do for you: which files you give it, where the output goes, and who may
change the layouts it compares. A clean result is not a security audit and not a guarantee that the upgrade is safe; it
is two files with none of the changes the checks look for, not a finding that the new version is right.

## How the tool behaves by default

- **Reads, never runs.** The tool reads the two layout files it is given. It follows no symbolic link, fetches no URL,
  refuses an argument that looks like an address, compiles nothing, opens none of the source files a layout names,
  connects to no node, evaluates nothing and writes nothing to disk.
- **Every check on from the first run.** A removed, moved or inserted variable, a changed type, a gap cut by the wrong
  number of slots, base contracts in another order, a removed namespace and a variable on an ERC-1967 slot are errors;
  a removed gap and a part of a layout that could not be compared are warnings; a renamed variable, a renamed type and
  appended members are notes. There is no configuration file that could set a check off.
- **Fail closed on what it cannot read.** A file that is not JSON, or holds no layout, is an error finding that fails the
  run at the default `--fail-on` of `error`, and the two layouts are not compared. A part of a layout that lacks what the
  comparison needs is a warning finding with its line, so a variable that was not compared is never taken for one that
  is fine. A file that is not text, is too large or is a link stops the run with exit code `2` and no report.
- **No guess about which contract.** A compiler output with several contracts and no `--contract` stops the run with the
  list of contracts, so a run never compares a contract you did not mean.
- **Unknown arguments are errors.** An option the tool does not know, a value that looks like an option and an option
  given twice stop the run, so a typo such as `--fail-no` cannot leave a default in place.
- **No pattern from the input.** No regular expression is built from a file or from an argument.
- **Bounded work.** The reader has limits of size, nesting, values and string length, the type comparison stops at 64
  levels (docs/limits.md), and the reader works with a stack of its own, so a deep or large file cannot exhaust the
  stack or the memory. The pairing of variables uses maps and a sorted list, so a layout of many thousands of variables
  is compared in good time.
- **No prototype tricks.** Keys from a file are kept in lists and in maps, never as properties of an object, so
  `__proto__` is only a name.
- **Clean output.** Text from the input, file names included, has control characters, line separators and direction
  controls replaced and its length capped before it reaches a report or an error message; the markdown report also
  escapes what markdown gives a meaning to.
- **The same input gives the same output.** No clock, no zone, no locale and no random number
  ([decision 1](decisions/0001-read-no-clock-and-keep-dates-out-of-the-repository.md)).
- **No dependencies.** Node 22 or newer and nothing else.

## Settings that make the check stricter

- **`--fail-on warning`.** A removed gap and a part of a layout that was not compared fail the run too; use it once the
  layouts are complete, so that nothing goes unread.
- **`--fail-on info`.** Renamed variables, renamed types and appended members fail the run too; use it where every such
  change must be looked at by a person, and record the decision in the pull request.
- **`--contract <old>,<new>`.** Name both contracts when you compare compiler outputs, so that the tool compares the
  contract behind the proxy and nothing else.
- **Keep the layout complete.** Use the layout format that lists enum members and namespaces when your tools write it, so
  that the checks see them (docs/inputs.md).

## Running it in a pipeline

```yaml
permissions:
  contents: read
steps:
  - uses: actions/checkout@3d3c42e5aac5ba805825da76410c181273ba90b1 # v7.0.1
  - uses: actions/setup-node@820762786026740c76f36085b0efc47a31fe5020 # v7.0.0
    with:
      node-version: 22
  - name: Storage layout check
    run: npx --yes github:INNERLUXES/storage-layout-check layouts/Vault.v1.json layouts/Vault.v2.json --format markdown >> "$GITHUB_STEP_SUMMARY"
```

- Give the job read access to the contents and nothing more. The tool needs no secret, no node address and no key;
  never give it one.
- Pin every action to a full commit, as above, and pin the tool to a release commit or a tag you have read, because
  `npx` runs what it downloads.
- Build the new layout in the pipeline from the commit under review, and take the old layout from the file kept for the
  version that is deployed, or build it from the tag of that version. A layout written by hand, or by the person who
  asks for the upgrade, is not evidence.
- Do not hide the exit code with a trailing `|| true`. To keep the report without failing, keep `--fail-on` at `error`
  and keep the SARIF or JSON report as an artifact of the job, or upload the SARIF to code scanning.
- Treat a report built from a file you do not trust as untrusted data.
- Run the other checks of your stack as well. This check is a first list for the review, and the review of the upgrade
  by people comes after it.

## Protecting the layouts

The layout of the deployed version decides what the next version must keep. Keep it in the repository next to the
source of that version, put its path in `CODEOWNERS` with the people who approve upgrades, and require their review in
branch protection. Review a change to a kept layout like a change to the deployed contract: a layout edited to match the
new code hides every finding.

## SSDF

The repository is checked against NIST SP 800-218 (SSDF) in its own pipeline and before every release, with
`ssdf-repo-check` pinned to its release commit. The evidence it looks for is in these files:

| Practice | Evidence in this repository |
| --- | --- |
| PO.1 Define security requirements | CONTRIBUTING.md, docs/secure-defaults.md |
| PO.2 Roles and responsibilities | .github/CODEOWNERS |
| PO.3 Toolchain | .github/workflows/ci.yml, codeql.yml, release.yml |
| PO.4 Criteria for security checks | CodeQL with the security-extended queries, the SSDF gate in ci.yml and release.yml |
| PO.5 Secure environments | a `permissions:` block in every workflow, actions pinned to commits |
| PS.1 Protect the code | .gitignore for keys and `.env`, `npm run check` for committed secrets |
| PS.2 Integrity of releases | SHA-256 checksums and a build provenance attestation in release.yml |
| PS.3 Archive and provenance | a CycloneDX SBOM and the CHANGELOG with every release |
| PW.1 Design for security | docs/threat-model.md |
| PW.2 Review the design | docs/decisions |
| PW.4 Reuse secure components | no runtime dependencies, a lock file, Dependabot |
| PW.5 Secure coding | CONTRIBUTING.md, `npm run check` |
| PW.6 Build settings | `npm ci` from the lock file |
| PW.7 Code review | the pull request template and CODEOWNERS |
| PW.8 Testing | `npm test` on Linux, Windows and macOS with Node 22 and 24, `npm run test:coverage`, hostile input tests |
| PW.9 Secure defaults | this document |
| RV.1 Find vulnerabilities | SECURITY.md, Dependabot |
| RV.2 Respond to vulnerabilities | SECURITY.md |
