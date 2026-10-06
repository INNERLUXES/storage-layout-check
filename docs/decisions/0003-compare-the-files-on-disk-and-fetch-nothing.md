# 3. Compare the files on disk, and fetch nothing

## Status

Accepted

## Context

Some facts about an upgrade live elsewhere: the implementation behind a proxy on a chain, the storage of the proxy, the
source of the deployed version, the latest release of the compiler, the pages of the documentation. A check could call a
node for the implementation address, read the storage slots of the proxy, compile the source, or download the
documentation. Each would need the network and often a key, would make the result depend on the state of a chain or a
server, and would let a file in a pull request make the pipeline reach an address it names.

What a team needs first, before an upgrade is deployed, is a list of what changed in the layout and where: the variables,
their slots and types, the gaps, the order of the base contracts, as the build writes them.

## Decision

1. The tool reads the two files it is given, and nothing else. It fetches nothing, calls no node, compiles nothing, needs
   no key, runs no program and calls no service.
2. The rules the checks apply (the pairing, the comparison of types, the gap arithmetic, the ERC-1967 slots) are the
   tool's own and are listed in docs/method.md, and the public pages each check rests on are named in src/data.js and
   research/sources.md, each fetched and read before it was listed, with a copy of its text under research/sources; the
   tool never looks them up while it runs.
3. The tool lists what to look at and what to change; it changes nothing.

## Consequences

- The result depends only on the files, and a run needs no network access, no secret and no node.
- Whether the old file is the layout of the deployed code is for the team to make sure; docs/secure-defaults.md says how.
- When the documentation changes a rule the checks apply, the checks are updated in a release, with a test.
