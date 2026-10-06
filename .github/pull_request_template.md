## What changes

<!-- One or two sentences. -->

## Checks

- [ ] `npm test`, `npm run test:coverage`, `npm run check` and `npm run example` pass, and the files under `examples/output` are the ones `npm run example` wrote
- [ ] A change to a check is described in docs/method.md, says what it can and cannot see, and has a test with the layouts written inline and a near miss on each side
- [ ] A change to what the tool cannot see is in docs/limits.md
- [ ] A change to a form of layout that is read is in docs/inputs.md and docs/method.md, and in the README
- [ ] A change to a point of a public page is in src/data.js, research/sources.md and docs/rules-and-sources.md, in this project's own words, with no long quotation, and the page is saved as text under research/sources
- [ ] A check that is a best practice and not a rule of the Solidity or OpenZeppelin documentation says so in its message and in its `own` text
- [ ] Nothing in the change, the README or the output reads as a security audit or a guarantee; the tool reads two files and runs nothing
- [ ] What a layout does not say is still a `layout-incomplete` finding with its line, and a check never takes a value it did not read for one that is fine
- [ ] The JSON reader still stops at its limits with the place and does not recurse, and the type comparison still stops at its depth limit
- [ ] Two types are still compared by what they hold, never by the ids of the syntax tree
- [ ] No pattern is built from a file or from an argument
- [ ] Text from the input goes through `safeText` before it reaches the output or an error message, and the markdown format escapes what markdown gives a meaning to
- [ ] The tool still reads no clock and no locale, opens no network connection, runs nothing it reads, evaluates nothing and writes nothing to disk
- [ ] Work stays bounded: the limits of docs/limits.md hold, and a hostile test has a time check that widens under coverage through `NODE_V8_COVERAGE`
- [ ] A test that depends on the operating system (a link, a device) is guarded with `process.platform`, asserts no line of its own, and builds its paths with `resolve()` from forward-slash names
- [ ] The example layouts stay made up and minimal: no real contract, company or person, and no number that reads like a year
- [ ] The commit messages of this pull request follow Conventional Commits
