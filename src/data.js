// The public pages the checks rest on, and the points of each page that the reports show, written in this project's own
// words. A page is named by its address; a copy of its text, read before it was listed, is kept under research/sources.
// research/sources.md lists every page with a note, docs/rules-and-sources.md lists every rule with its points, and
// test/data.test.js checks the three against each other.

export const LEVELS = ['info', 'warning', 'error'];

export const NOTICE = 'This report is an input to a review before an upgrade is deployed: not a security audit and not a guarantee that the upgrade is safe.';

const SOLIDITY = 'https://docs.soliditylang.org/en/latest';
const OZ = 'https://docs.openzeppelin.com/upgrades-plugins';

export const SOURCES = [
  { id: 'layout', title: 'Layout of State Variables in Storage and Transient Storage (Solidity documentation)', url: `${SOLIDITY}/internals/layout_in_storage.html`, file: 'research/sources/solidity-layout-in-storage.txt' },
  { id: 'compiler', title: 'Using the Compiler (Solidity documentation)', url: `${SOLIDITY}/using-the-compiler.html`, file: 'research/sources/solidity-using-the-compiler.txt' },
  { id: 'oz-writing', title: 'Writing Upgradeable Contracts (OpenZeppelin Upgrades Plugins documentation)', url: `${OZ}/writing-upgradeable`, file: 'research/sources/oz-writing-upgradeable-contracts.txt' },
  { id: 'oz-proxies', title: 'Proxy Upgrade Pattern (OpenZeppelin Upgrades Plugins documentation)', url: `${OZ}/proxies`, file: 'research/sources/oz-proxy-upgrade-pattern.txt' },
  { id: 'oz-layout', title: 'The storage layout format of OpenZeppelin Upgrades (packages/core/src/storage/layout.ts)', url: 'https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/master/packages/core/src/storage/layout.ts', file: 'research/sources/oz-upgrades-core-layout.ts.txt' },
  { id: 'erc-1967', title: 'ERC-1967: Proxy Storage Slots', url: 'https://eips.ethereum.org/EIPS/eip-1967', file: 'research/sources/erc-1967-proxy-storage-slots.txt' },
  { id: 'erc-7201', title: 'ERC-7201: Namespaced Storage Layout', url: 'https://eips.ethereum.org/EIPS/eip-7201', file: 'research/sources/erc-7201-namespaced-storage-layout.txt' },
  { id: 'forge-inspect', title: 'forge inspect (Foundry reference)', url: 'https://www.getfoundry.sh/reference/forge/inspect', file: 'research/sources/forge-inspect.txt' }
];

// Points: id -> { source, text }.
export const POINTS = {
  'layout-sequential': { source: 'layout', text: 'State variables are placed one after another from slot 0, and small values share a slot where they fit, so the place of a variable follows from every variable declared before it.' },
  'layout-inheritance': { source: 'layout', text: 'Under inheritance the variables are ordered by the C3 linearization of the contracts, beginning with the most base-ward one, so the order of the base contracts decides where each variable is kept.' },
  'layout-size-packing': { source: 'layout', text: 'The size of a value type sets how many bytes it takes and whether the next variable shares its slot; a struct or an array always opens a new slot, and so does the variable after it.' },
  'layout-mapping-hash': { source: 'layout', text: 'A mapping or a dynamic array takes one slot in the sequence, and its contents are kept at slots computed with keccak256 from that slot and, for a mapping, from the key.' },
  'layout-bytes-string': { source: 'layout', text: 'The page says that bytes and string have the same encoding in storage.' },
  'layout-not-in-storage': { source: 'layout', text: 'Constant, immutable and transient variables are kept elsewhere and play no part in the storage layout, so they are not in it.' },
  'layout-json': { source: 'layout', text: 'The compiler can write the layout as JSON: a storage list with the contract, label, slot, offset and type of every variable, and a types object with the encoding, label and size of every type, plus its key and value, base or members.' },
  'compiler-output': { source: 'compiler', text: 'In the standard JSON output each contract, under its source file, carries a storageLayout object when the output selection asks for one.' },
  'forge-inspect-field': { source: 'forge-inspect', text: 'forge inspect names a contract by an optional path and its name, and storageLayout is one of the fields it prints.' },
  'oz-order-type': { source: 'oz-writing', text: 'A new version may not change the order in which the state variables are declared or their types; doing so mixes up the stored values.' },
  'oz-insert-remove': { source: 'oz-writing', text: 'New variables go at the end; a variable added before existing ones, or a variable removed, breaks the layout of what follows it.' },
  'oz-remove-end': { source: 'oz-writing', text: 'A variable removed from the end leaves its storage as it was, and a variable added there later starts with the old value.' },
  'oz-rename': { source: 'oz-writing', text: 'A renamed variable keeps the value of the old one after the upgrade, which is right only when the two mean the same.' },
  'oz-base-order': { source: 'oz-writing', text: 'Swapping the order of the base contracts, or adding a base contract, changes where the variables are kept.' },
  'oz-base-add': { source: 'oz-writing', text: 'A variable added to a base contract takes the slot that a variable of the child had, unless the base reserved room for it.' },
  'oz-gap': { source: 'oz-writing', text: 'A storage gap is a fixed-size array named __gap, or with a name starting with __gap_, that reserves slots in a base contract; when variables are added, the gap is cut by the slots they take under the packing rules.' },
  'oz-namespace': { source: 'oz-writing', text: 'Namespaced storage puts the variables of a contract in structs annotated with an erc7201 storage location, and a change inside a namespace is held to the same rules as a change to the ordinary layout.' },
  'oz-collision': { source: 'oz-proxies', text: 'Two versions of a logic contract collide when the new one keeps another variable where the old one kept a value, so a new version extends storage and never modifies it.' },
  'oz-layout-format': { source: 'oz-layout', text: 'The layout format of OpenZeppelin Upgrades adds an optional namespaces object of storage lists to the compiler form, and lets an enum type list its members as strings.' },
  'erc1967-slots': { source: 'erc-1967', text: 'ERC-1967 fixes three slots, each derived from a hash, for the address of the logic contract, the beacon and the admin of a proxy, chosen so that a compiler never allocates them.' },
  'erc7201-root': { source: 'erc-7201', text: 'ERC-7201 marks a namespace with the annotation @custom:storage-location erc7201:<id> and derives its root slot from the id; the variables of the namespace follow the ordinary layout rules from that root.' }
};

export const source = (id) => SOURCES.find((s) => s.id === id);
export const pointPage = (id) => source(POINTS[id].source);
