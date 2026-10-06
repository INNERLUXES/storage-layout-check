# Rules and sources

Every check of the tool, with what it looks at, the points of the public pages it rests on, what it cannot see, and what to change. The points are in this project's own words and are the ones the reports show with `--explain`; each page was fetched and read before it was listed, and a copy of its text is kept under [research/sources](../research/sources) so that a point can be checked against the page it came from. [../research/sources.md](../research/sources.md) has a note on each page.

The tool is an input to a review before an upgrade is deployed: not a security audit and not a guarantee that the upgrade is safe. A check that is a best practice of this tool says so in its message; it is not a rule in the Solidity or OpenZeppelin documentation.

## The pages

- Layout of State Variables in Storage and Transient Storage (Solidity documentation): https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html (copy: `research/sources/solidity-layout-in-storage.txt`)
- Using the Compiler (Solidity documentation): https://docs.soliditylang.org/en/latest/using-the-compiler.html (copy: `research/sources/solidity-using-the-compiler.txt`)
- Writing Upgradeable Contracts (OpenZeppelin Upgrades Plugins documentation): https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable (copy: `research/sources/oz-writing-upgradeable-contracts.txt`)
- Proxy Upgrade Pattern (OpenZeppelin Upgrades Plugins documentation): https://docs.openzeppelin.com/upgrades-plugins/proxies (copy: `research/sources/oz-proxy-upgrade-pattern.txt`)
- The storage layout format of OpenZeppelin Upgrades (packages/core/src/storage/layout.ts): https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/master/packages/core/src/storage/layout.ts (copy: `research/sources/oz-upgrades-core-layout.ts.txt`)
- ERC-1967: Proxy Storage Slots: https://eips.ethereum.org/EIPS/eip-1967 (copy: `research/sources/erc-1967-proxy-storage-slots.txt`)
- ERC-7201: Namespaced Storage Layout: https://eips.ethereum.org/EIPS/eip-7201 (copy: `research/sources/erc-7201-namespaced-storage-layout.txt`)
- forge inspect (Foundry reference): https://www.getfoundry.sh/reference/forge/inspect (copy: `research/sources/forge-inspect.txt`)

## layout-unreadable

- Level: error
- Kind: a problem with a file itself; it has no setting to lower
- Looks at: a file is not JSON the reader can follow, or holds no storage layout in a form the tool reads (a layout object, an artifact with storageLayout, a compiler output with contracts).
- Cannot see: It stops at the first place that is not JSON, or at the first sign that the file is not a layout, so nothing in that file is compared.
- What to change: Give the storage layout as the compiler, forge inspect or an artifact writes it (docs/inputs.md), and fix the line named.
- Points of the pages:
  - The compiler can write the layout as JSON: a storage list with the contract, label, slot, offset and type of every variable, and a types object with the encoding, label and size of every type, plus its key and value, base or members. (Layout of State Variables in Storage and Transient Storage (Solidity documentation), https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)
  - In the standard JSON output each contract, under its source file, carries a storageLayout object when the output selection asks for one. (Using the Compiler (Solidity documentation), https://docs.soliditylang.org/en/latest/using-the-compiler.html)
  - forge inspect names a contract by an optional path and its name, and storageLayout is one of the fields it prints. (forge inspect (Foundry reference), https://www.getfoundry.sh/reference/forge/inspect)

## layout-incomplete

- Level: warning
- Kind: a problem with a file itself; it has no setting to lower
- Looks at: a variable or a type of a layout lacks what the comparison needs (a label, slot, offset or type, a size, a type that is not in types); that part was not compared.
- Cannot see: It names the variable or the type and its line; it does not say what the missing part would have shown.
- What to change: Give the layout as the compiler writes it, or compare that part by hand.
- Points of the pages:
  - The compiler can write the layout as JSON: a storage list with the contract, label, slot, offset and type of every variable, and a types object with the encoding, label and size of every type, plus its key and value, base or members. (Layout of State Variables in Storage and Transient Storage (Solidity documentation), https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)

## variable-removed

- Level: error
- Kind: documented
- Looks at: a variable of the old layout is not in the new one, under its name or at its place.
- Cannot see: It cannot tell a variable that is no longer needed from one removed by mistake, and it does not know whether the old value still matters.
- What to change: Keep the variable at its place, under its old name or a new one; if it is no longer used, leave it declared and unused.
- Points of the pages:
  - New variables go at the end; a variable added before existing ones, or a variable removed, breaks the layout of what follows it. (Writing Upgradeable Contracts (OpenZeppelin Upgrades Plugins documentation), https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable)
  - A variable removed from the end leaves its storage as it was, and a variable added there later starts with the old value. (Writing Upgradeable Contracts (OpenZeppelin Upgrades Plugins documentation), https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable)
  - Constant, immutable and transient variables are kept elsewhere and play no part in the storage layout, so they are not in it. (Layout of State Variables in Storage and Transient Storage (Solidity documentation), https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)

## variable-moved

- Level: error
- Kind: documented
- Looks at: a variable is at another slot or offset in the new layout.
- Cannot see: It reports every variable that moved, so one insertion near the start gives a finding for each variable after it; the first finding is the place to look.
- What to change: Declare the variables in the old order and keep every base contract as it was; add new variables after the last one, or take their slots from a gap.
- Points of the pages:
  - State variables are placed one after another from slot 0, and small values share a slot where they fit, so the place of a variable follows from every variable declared before it. (Layout of State Variables in Storage and Transient Storage (Solidity documentation), https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)
  - A new version may not change the order in which the state variables are declared or their types; doing so mixes up the stored values. (Writing Upgradeable Contracts (OpenZeppelin Upgrades Plugins documentation), https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable)
  - Two versions of a logic contract collide when the new one keeps another variable where the old one kept a value, so a new version extends storage and never modifies it. (Proxy Upgrade Pattern (OpenZeppelin Upgrades Plugins documentation), https://docs.openzeppelin.com/upgrades-plugins/proxies)

## type-changed

- Level: error
- Kind: documented
- Looks at: a variable keeps its name and gets a type with another storage form: another size or signedness, another mapping key or value, other struct members, another array length, or enum members removed or reordered.
- Cannot see: It compares the storage form, not the meaning: two types of the same form are a note, not an error. The compiler output names an enum and its size but not its members, so an enum with members removed is seen only when the layout lists them, as the OpenZeppelin format does.
- What to change: Keep the old type; add a variable of the new type after the last one and move the data in an upgrade step.
- Points of the pages:
  - A new version may not change the order in which the state variables are declared or their types; doing so mixes up the stored values. (Writing Upgradeable Contracts (OpenZeppelin Upgrades Plugins documentation), https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable)
  - The size of a value type sets how many bytes it takes and whether the next variable shares its slot; a struct or an array always opens a new slot, and so does the variable after it. (Layout of State Variables in Storage and Transient Storage (Solidity documentation), https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)
  - A mapping or a dynamic array takes one slot in the sequence, and its contents are kept at slots computed with keccak256 from that slot and, for a mapping, from the key. (Layout of State Variables in Storage and Transient Storage (Solidity documentation), https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)

## variable-inserted

- Level: error
- Kind: documented
- Looks at: a new variable takes storage that a variable of the old layout used, as happens when it is declared before existing ones or in a base contract with no room.
- Cannot see: It reports a new variable that takes storage an old variable used. A new variable placed in bytes that no old variable used is not reported.
- What to change: Declare new variables after the last one, or in a base contract take their slots from its gap.
- Points of the pages:
  - New variables go at the end; a variable added before existing ones, or a variable removed, breaks the layout of what follows it. (Writing Upgradeable Contracts (OpenZeppelin Upgrades Plugins documentation), https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable)
  - A variable added to a base contract takes the slot that a variable of the child had, unless the base reserved room for it. (Writing Upgradeable Contracts (OpenZeppelin Upgrades Plugins documentation), https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable)
  - Two versions of a logic contract collide when the new one keeps another variable where the old one kept a value, so a new version extends storage and never modifies it. (Proxy Upgrade Pattern (OpenZeppelin Upgrades Plugins documentation), https://docs.openzeppelin.com/upgrades-plugins/proxies)

## gap-mismatch

- Level: error
- Kind: documented
- Looks at: the slots added before a storage gap in a contract are not the slots the gap was cut by, so what follows the gap moves.
- Cannot see: It compares the slots between the first variable of the contract and its gap in the two layouts; it does not say which of the new variables took the slots.
- What to change: Cut the gap by exactly the slots the new variables take, counting how they pack.
- Points of the pages:
  - A storage gap is a fixed-size array named __gap, or with a name starting with __gap_, that reserves slots in a base contract; when variables are added, the gap is cut by the slots they take under the packing rules. (Writing Upgradeable Contracts (OpenZeppelin Upgrades Plugins documentation), https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable)
  - A variable added to a base contract takes the slot that a variable of the child had, unless the base reserved room for it. (Writing Upgradeable Contracts (OpenZeppelin Upgrades Plugins documentation), https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable)

## gap-removed

- Level: warning
- Kind: best practice of this tool, not a rule in the Solidity or OpenZeppelin documentation
- Looks at: a contract that had a storage gap has none in the new layout.
- Cannot see: It cannot tell whether the contract will grow again.
- What to change: Keep a gap in every base contract that may grow; drop it only when the variables that replace it take exactly its slots.
- The tool's own choice: keeping a gap in every contract that had one is a best practice of this tool, not a rule in the Solidity or OpenZeppelin documentation; the OpenZeppelin page describes gaps as a convention.
- Points of the pages:
  - A storage gap is a fixed-size array named __gap, or with a name starting with __gap_, that reserves slots in a base contract; when variables are added, the gap is cut by the slots they take under the packing rules. (Writing Upgradeable Contracts (OpenZeppelin Upgrades Plugins documentation), https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable)

## inheritance-order-changed

- Level: error
- Kind: documented
- Looks at: the contracts that hold storage come in another order in the new layout.
- Cannot see: It sees the order of the contracts that hold storage, not the inheritance list in the source; a base contract with no state variable is not seen.
- What to change: Keep the base contracts in their old order; a new base contract with storage needs room that does not move the others, such as a namespace.
- Points of the pages:
  - Under inheritance the variables are ordered by the C3 linearization of the contracts, beginning with the most base-ward one, so the order of the base contracts decides where each variable is kept. (Layout of State Variables in Storage and Transient Storage (Solidity documentation), https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)
  - Swapping the order of the base contracts, or adding a base contract, changes where the variables are kept. (Writing Upgradeable Contracts (OpenZeppelin Upgrades Plugins documentation), https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable)

## namespace-removed

- Level: error
- Kind: documented
- Looks at: an ERC-7201 namespace of the old layout is not in the new one.
- Cannot see: It reads the namespaces the layout file holds. The compiler output itself has no namespaces; they come from a layout format that adds them, such as the one of OpenZeppelin Upgrades. It does not work out the root slot of a namespace from its id.
- What to change: Keep the namespace struct with its annotation and its members, even those no longer used.
- Points of the pages:
  - Namespaced storage puts the variables of a contract in structs annotated with an erc7201 storage location, and a change inside a namespace is held to the same rules as a change to the ordinary layout. (Writing Upgradeable Contracts (OpenZeppelin Upgrades Plugins documentation), https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable)
  - ERC-7201 marks a namespace with the annotation @custom:storage-location erc7201:<id> and derives its root slot from the id; the variables of the namespace follow the ordinary layout rules from that root. (ERC-7201: Namespaced Storage Layout, https://eips.ethereum.org/EIPS/eip-7201)
  - The layout format of OpenZeppelin Upgrades adds an optional namespaces object of storage lists to the compiler form, and lets an enum type list its members as strings. (The storage layout format of OpenZeppelin Upgrades (packages/core/src/storage/layout.ts), https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/master/packages/core/src/storage/layout.ts)
  - A variable removed from the end leaves its storage as it was, and a variable added there later starts with the old value. (Writing Upgradeable Contracts (OpenZeppelin Upgrades Plugins documentation), https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable)

## proxy-slot-overlap

- Level: error
- Kind: documented
- Looks at: a variable of the new layout takes a slot that ERC-1967 sets aside for a proxy (the logic contract, the beacon or the admin).
- Cannot see: It checks the ordinary storage of the new layout. The slots of a namespace are relative to its root and are not checked against the ERC-1967 slots.
- What to change: Move the variable, or the base slot of a custom layout, away from the ERC-1967 slots.
- Points of the pages:
  - ERC-1967 fixes three slots, each derived from a hash, for the address of the logic contract, the beacon and the admin of a proxy, chosen so that a compiler never allocates them. (ERC-1967: Proxy Storage Slots, https://eips.ethereum.org/EIPS/eip-1967)
  - State variables are placed one after another from slot 0, and small values share a slot where they fit, so the place of a variable follows from every variable declared before it. (Layout of State Variables in Storage and Transient Storage (Solidity documentation), https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)

## variable-renamed

- Level: info
- Kind: documented
- Looks at: a variable of the old layout has a new name, or is declared in another contract, at the same slot and offset with the same storage form, so it keeps the old value.
- Cannot see: It pairs a renamed variable by its place and storage form; it cannot tell whether the new name means the same.
- What to change: Confirm that the variable means the same as before, since it starts with the old value.
- Points of the pages:
  - A renamed variable keeps the value of the old one after the upgrade, which is right only when the two mean the same. (Writing Upgradeable Contracts (OpenZeppelin Upgrades Plugins documentation), https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable)

## type-renamed

- Level: info
- Kind: best practice of this tool, not a rule in the Solidity or OpenZeppelin documentation
- Looks at: a variable keeps its place and its storage form under another type name: a contract type and address, string and bytes, a renamed struct or enum, a user-defined value type.
- Cannot see: It cannot tell what a user-defined value type wraps when the layout does not say, and it does not know whether the values mean the same under the new type.
- What to change: Confirm that the stored values mean the same under the new type.
- The tool's own choice: reading these types as one storage form is a best practice of this tool, not a rule in the Solidity or OpenZeppelin documentation; it rests on the sizes and encodings in the layout and on the page that says bytes and string are encoded the same way.
- Points of the pages:
  - The page says that bytes and string have the same encoding in storage. (Layout of State Variables in Storage and Transient Storage (Solidity documentation), https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)
  - The compiler can write the layout as JSON: a storage list with the contract, label, slot, offset and type of every variable, and a types object with the encoding, label and size of every type, plus its key and value, base or members. (Layout of State Variables in Storage and Transient Storage (Solidity documentation), https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)

## type-extended

- Level: info
- Kind: best practice of this tool, not a rule in the Solidity or OpenZeppelin documentation
- Looks at: members were appended to a struct stored as a mapping value or within its old size, or to an enum, and what was stored keeps its place.
- Cannot see: It does not read the code, so it does not know whether old entries with zero in the new members are handled.
- What to change: Confirm that the code handles what was stored before the upgrade: appended struct members read as zero there.
- The tool's own choice: accepting appended members is a best practice of this tool, not a rule in the Solidity or OpenZeppelin documentation; it follows from the layout rules for mapping values, which the OpenZeppelin page does not discuss.
- Points of the pages:
  - A mapping or a dynamic array takes one slot in the sequence, and its contents are kept at slots computed with keccak256 from that slot and, for a mapping, from the key. (Layout of State Variables in Storage and Transient Storage (Solidity documentation), https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html)
  - The layout format of OpenZeppelin Upgrades adds an optional namespaces object of storage lists to the compiler form, and lets an enum type list its members as strings. (The storage layout format of OpenZeppelin Upgrades (packages/core/src/storage/layout.ts), https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/master/packages/core/src/storage/layout.ts)
