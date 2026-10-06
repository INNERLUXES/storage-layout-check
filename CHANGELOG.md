# Changes

## 1.0.0

First release.

- Compares the storage layout of two versions of an upgradeable Solidity contract and lists the changes that would
  corrupt storage behind a proxy, with file and line, as an input to a review before an upgrade is deployed: not a
  security audit and not a guarantee that the upgrade is safe. It reads the two files, compiles nothing, runs nothing,
  fetches nothing, follows no symbolic link and reads no clock.
- Reads the layout object the compiler writes (also what `forge inspect <contract> storageLayout --json` prints), an
  artifact with `storageLayout`, a standard JSON output of the compiler and a build info file, with `--contract` to pick
  a contract by name or by path:Name and `<old>,<new>` for a contract renamed between versions. Reads the namespaces,
  enum members and underlying types that the OpenZeppelin layout format adds when a layout holds them.
- A strict JSON reader with no dependency and no recursion, with the line and column of every value, a key written
  twice as an error, and limits of size, nesting, values and string length.
- Variables paired by contract and name, by name alone for a declaration that moved to another contract, and by place
  and storage form for a rename; a contract renamed between versions is followed. Types compared by what they hold,
  never by the ids of the syntax tree.
- Fourteen checks in three levels, each documented or a best practice of the tool and saying which: a removed variable
  (`variable-removed`), a moved variable (`variable-moved`), a changed type (`type-changed`), a new variable on the
  storage of an old one (`variable-inserted`), a gap cut by the wrong number of slots (`gap-mismatch`), a removed gap
  (`gap-removed`), base contracts in another order (`inheritance-order-changed`), a removed ERC-7201 namespace
  (`namespace-removed`), a variable on an ERC-1967 slot (`proxy-slot-overlap`), a renamed variable
  (`variable-renamed`), a renamed type (`type-renamed`), appended struct or enum members (`type-extended`); and two
  checks about the input (`layout-unreadable`, `layout-incomplete`).
- Reports as text, markdown, JSON and SARIF 2.1.0; every finding has its id, severity, message, side, file, line and
  column; `--min-severity`, `--fail-on`, `--explain` with the points of the documentation behind each finding, and
  `--list-checks`. Exit code `0` when no finding is at or above the fail-on level, `1` when one is, `2` for a usage or
  input error, with no result.
- Plain text copies of the public pages the checks rest on, under research/sources, with a note on each page.
- Release packages come with a CycloneDX SBOM, SHA-256 checksums and a build provenance attestation, after the SSDF gate
  of the repository.
