# Sources

The public pages the checks of this tool are based on, each with a short note in this project's own words on what the
page says and which checks lean on it. Nothing here is a copy of a page: read the page itself for its exact wording. A
plain text copy of each page, taken when it was read, is kept in [research/sources](sources) so that a point can be
checked against the page it came from, and the copies are the pages' own words, not this project's. The copies leave
out the buttons and links around a page, the date lines of the ERC pages and their citation blocks, and write curly
quotes and dashes as plain ASCII. src/data.js holds the pages and the points the reports show, and test/data.test.js
checks that every page in src/data.js is listed here and has its copy.

The tool reads two storage layout files and runs nothing; its result is an input to a review before an upgrade is
deployed, not a security audit and not a guarantee that the upgrade is safe. These notes say what the pages say so a
reader can follow a finding back to its source; they are not advice on any one contract. The pages were chosen with web
addresses that hold no number that reads like a year: the Solidity documentation at its latest version, the OpenZeppelin
Upgrades Plugins documentation, the master branch of the OpenZeppelin Upgrades repository, the ERC pages and the Foundry
reference.

Where a check rests on a statement the pages do not make, it is a best practice of this tool, its message says so, and
the note for the check in [docs/rules-and-sources.md](../docs/rules-and-sources.md) names the choice.

## The Solidity documentation

### Layout of State Variables in Storage and Transient Storage

https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html

Copy: research/sources/solidity-layout-in-storage.txt

How the compiler places state variables. They are stored one after another from slot 0, and items smaller than 32 bytes
share a slot when they fit; structs and arrays always start a new slot, and so does the item after them. Under
inheritance the order follows the C3 linearization, starting with the most base-ward contract. Constant, immutable and
transient variables take no part in the storage layout. A mapping or a dynamic array takes one slot in the sequence, and
its contents live at slots computed with keccak256; bytes and string are encoded the same way. A custom layout base
shifts every slot. The JSON output section describes the storage list (astId, contract, label, offset, slot, type) and
the types object (encoding, label, numberOfBytes, and key and value, base or members), with a full example that a test
reads. `layout-unreadable`, `layout-incomplete`, `variable-removed`, `variable-moved`, `type-changed`,
`inheritance-order-changed`, `proxy-slot-overlap`, `type-renamed` and `type-extended` lean on it.

### Using the Compiler

https://docs.soliditylang.org/en/latest/using-the-compiler.html

Copy: research/sources/solidity-using-the-compiler.txt

The command line and the standard JSON interface. The output selection names storageLayout as the slots, offsets and
types of the state variables of a contract, and the output description shows the storageLayout object under each
contract, which sits under its source file in contracts. `layout-unreadable` leans on it, and the tool reads that
shape when it is given a compiler output.

## OpenZeppelin

### Writing Upgradeable Contracts

https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable

Copy: research/sources/oz-writing-upgradeable-contracts.txt

The rules for a new version of an upgradeable contract. The order and the types of the state variables may not change;
a new variable goes at the end, not before existing ones; a variable may not be removed, and one removed from the end
leaves its value for a later variable. A renamed variable keeps the old value. Changing the order of the base contracts
or adding one changes where the variables are stored, and a variable added to a base contract takes the slot of a child
variable. Storage gaps (an array named __gap or starting with __gap_) reserve slots in a base contract and are cut by
the slots new variables take, counting packing. Namespaced storage under ERC-7201 is held to the same rules inside each
namespace. `variable-removed`, `variable-moved`, `type-changed`, `variable-inserted`, `gap-mismatch`, `gap-removed`,
`inheritance-order-changed`, `namespace-removed` and `variable-renamed` lean on it.

### Proxy Upgrade Pattern

https://docs.openzeppelin.com/upgrades-plugins/proxies

Copy: research/sources/oz-proxy-upgrade-pattern.txt

How a proxy delegates to a logic contract, so the state lives in the proxy. The proxy keeps its own address of the
logic contract at a slot derived from a hash, as ERC-1967 sets out, so that it does not collide with the variables of
the logic contract. Two versions of a logic contract collide when the new one keeps another variable where the old one
kept a value; new versions must extend storage and never modify it. `variable-moved` and `variable-inserted` lean on it.

### The storage layout format of OpenZeppelin Upgrades

https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/master/packages/core/src/storage/layout.ts

Copy: research/sources/oz-upgrades-core-layout.ts.txt

The TypeScript types of the layout that OpenZeppelin Upgrades keeps. It is the compiler form (storage and types) with an
optional namespaces object of storage lists keyed by namespace id, a type may name its underlying type, and an enum may
list its members as strings. The tool reads those fields when a layout holds them. `namespace-removed` and
`type-extended` lean on it.

## The ERCs

### ERC-1967: Proxy Storage Slots

https://eips.ethereum.org/EIPS/eip-1967

Copy: research/sources/erc-1967-proxy-storage-slots.txt

The standard slots where a proxy keeps the address of its logic contract, its beacon and its admin, each derived from a
hash minus one so that a compiler never allocates them. `proxy-slot-overlap` checks the new layout against the three
slots the page gives.

### ERC-7201: Namespaced Storage Layout

https://eips.ethereum.org/EIPS/eip-7201

Copy: research/sources/erc-7201-namespaced-storage-layout.txt

The NatSpec annotation @custom:storage-location erc7201:<id> on a struct marks a namespace, and the formula derives its
root slot from the id. The variables of a namespace follow the ordinary layout rules from that root, and the compilers
do not see a namespace as state variables. `namespace-removed` leans on it.

## Foundry

### forge inspect

https://www.getfoundry.sh/reference/forge/inspect

Copy: research/sources/forge-inspect.txt

The reference of forge inspect. It takes a contract as an optional path and a name, and storageLayout is one of the
artifact fields it prints. `layout-unreadable` leans on it, and the tool takes the same path:Name form in `--contract`.
