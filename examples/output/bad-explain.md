# storage-layout-check: examples/v1/layout.json -> examples/v2-bad/layout.json

- Old: 327 lines, 7,604 bytes, a storage layout; 15 variables in 4 contracts, 5 variables in 2 namespaces
- New: 324 lines, 7,584 bytes, a storage layout; 16 variables in 4 contracts, 4 variables in 1 namespace
- Findings: 22 \(20 error, 1 warning, 1 info\)
- Result: **FAIL - 20 findings at or above error \(20 error, 1 warning, 1 info\)**

## Findings

| Level | Check | Where | Message |
| --- | --- | --- | --- |
| error | variable-removed | examples/v1/layout.json:86 | Vault.paused \(bool\) at slot 113, offset 0 is not in the new layout, under its name or at its place. Its value stays in storage, and a variable that takes its place starts with that value. A variable turned into a constant or an immutable leaves storage too. Fix: Keep the variable at its place, under its old name or a new one; if it is no longer used, leave it declared and unused. |
| error | namespace-removed | examples/v1/layout.json:316 | The namespace erc7201:example.vault.legacy of the old layout \(1 variable\) is not in the new one. Its values stay in storage, and a namespace with the same id added later starts with them. Fix: Keep the namespace struct with its annotation and its members, even those no longer used. |
| error | inheritance-order-changed | examples/v2-bad/layout.json:30 | The contracts that hold storage come in the order AccessBase, FeeBase, ListBase and Vault in the old layout and AccessBase, ListBase, FeeBase and Vault in the new one. Their variables are laid out in the order of the base contracts, so the variables of the contracts that changed place move. Fix: Keep the base contracts in their old order; a new base contract with storage needs room that does not move the others, such as a namespace. |
| error | variable-moved | examples/v2-bad/layout.json:30 | ListBase.allowed moves from slot 100, offset 0 to slot 50, offset 0, so after the upgrade it reads what the old version stored there and its old value is left behind. Fix: Declare the variables in the old order and keep every base contract as it was; add new variables after the last one, or take their slots from a gap. |
| error | variable-moved | examples/v2-bad/layout.json:38 | FeeBase.feeRate moves from slot 50, offset 0 to slot 51, offset 0, so after the upgrade it reads what the old version stored there and its old value is left behind. Fix: Declare the variables in the old order and keep every base contract as it was; add new variables after the last one, or take their slots from a gap. |
| error | variable-moved | examples/v2-bad/layout.json:46 | FeeBase.treasury moves from slot 50, offset 2 to slot 51, offset 2, so after the upgrade it reads what the old version stored there and its old value is left behind. Fix: Declare the variables in the old order and keep every base contract as it was; add new variables after the last one, or take their slots from a gap. |
| error | gap-mismatch | examples/v2-bad/layout.json:62 | The gap FeeBase.\_\_gap kept its 49 slots, while the variables of FeeBase before it take 1 more slot, so the variables after the gap move 1 slot further. A gap shrinks by exactly the slots the new variables take. Fix: Cut the gap by exactly the slots the new variables take, counting how they pack. |
| error | variable-inserted | examples/v2-bad/layout.json:70 | Vault.version is new and sits at slot 102, offset 0, where the old layout keeps ListBase.\_\_gap, so it starts with the value stored there. New variables go after the last one, or into the gap of their own contract. Fix: Declare new variables after the last one, or in a base contract take their slots from its gap. |
| error | type-changed | examples/v2-bad/layout.json:78 | The type of Vault.balances changes: the key type of the mapping changes: address becomes uint256, a type with another storage form, so stored entries are looked up under keys of another type. Fix: Keep the old type; add a variable of the new type after the last one and move the data in an upgrade step. |
| error | variable-moved | examples/v2-bad/layout.json:78 | Vault.balances moves from slot 110, offset 0 to slot 103, offset 0, so after the upgrade it reads what the old version stored there and its old value is left behind. Fix: Declare the variables in the old order and keep every base contract as it was; add new variables after the last one, or take their slots from a gap. |
| error | variable-moved | examples/v2-bad/layout.json:86 | Vault.totalShares moves from slot 111, offset 0 to slot 104, offset 0, so after the upgrade it reads what the old version stored there and its old value is left behind. Fix: Declare the variables in the old order and keep every base contract as it was; add new variables after the last one, or take their slots from a gap. |
| error | type-changed | examples/v2-bad/layout.json:94 | The type of Vault.positions changes: the value type of the mapping changes: member since of struct Vault.Position changes: uint64 becomes uint128: the size changes from 8 bytes to 16 bytes, so the variable and what is packed next to it are read at other bytes. Fix: Keep the old type; add a variable of the new type after the last one and move the data in an upgrade step. |
| error | variable-moved | examples/v2-bad/layout.json:94 | Vault.positions moves from slot 112, offset 0 to slot 105, offset 0, so after the upgrade it reads what the old version stored there and its old value is left behind. Fix: Declare the variables in the old order and keep every base contract as it was; add new variables after the last one, or take their slots from a gap. |
| error | type-changed | examples/v2-bad/layout.json:102 | The type of Vault.mode changes: the members of enum Vault.Mode change: Paused is removed, so a stored number names another member or none. Fix: Keep the old type; add a variable of the new type after the last one and move the data in an upgrade step. |
| error | variable-moved | examples/v2-bad/layout.json:102 | Vault.mode moves from slot 113, offset 1 to slot 106, offset 0, so after the upgrade it reads what the old version stored there and its old value is left behind. Fix: Declare the variables in the old order and keep every base contract as it was; add new variables after the last one, or take their slots from a gap. |
| error | type-changed | examples/v2-bad/layout.json:110 | The type of Vault.history changes: uint256\[3\] becomes uint256\[4\]: the length changes from 3 to 4, so the array takes another number of slots. Fix: Keep the old type; add a variable of the new type after the last one and move the data in an upgrade step. |
| error | variable-moved | examples/v2-bad/layout.json:110 | Vault.history moves from slot 114, offset 0 to slot 107, offset 0, so after the upgrade it reads what the old version stored there and its old value is left behind. Fix: Declare the variables in the old order and keep every base contract as it was; add new variables after the last one, or take their slots from a gap. |
| error | variable-moved | examples/v2-bad/layout.json:118 | Vault.note moves from slot 117, offset 0 to slot 111, offset 0, so after the upgrade it reads what the old version stored there and its old value is left behind. Fix: Declare the variables in the old order and keep every base contract as it was; add new variables after the last one, or take their slots from a gap. |
| error | type-changed | examples/v2-bad/layout.json:126 | The type of Vault.limit changes: int128 becomes uint128: the same size with another signedness, so a stored value is read as another number. Fix: Keep the old type; add a variable of the new type after the last one and move the data in an upgrade step. |
| error | variable-moved | examples/v2-bad/layout.json:126 | Vault.limit moves from slot 118, offset 0 to slot 112, offset 0, so after the upgrade it reads what the old version stored there and its old value is left behind. Fix: Declare the variables in the old order and keep every base contract as it was; add new variables after the last one, or take their slots from a gap. |
| warning | gap-removed | examples/v1/layout.json:54 | The gap ListBase.\_\_gap \(uint256\[9\]\) at slot 101, offset 0 is not in the new layout, so ListBase has no room left for new variables that would not move the variables declared after it. This is a best practice of this tool, not a rule in the Solidity or OpenZeppelin documentation. Fix: Keep a gap in every base contract that may grow; drop it only when the variables that replace it take exactly its slots. |
| info | variable-renamed | examples/v2-bad/layout.json:293 | rate in namespace erc7201:example.vault.rewards is renamed ratePerSecond at the same slot 0, offset 0 with the same storage form, so ratePerSecond starts with the value of rate. Fix: Confirm that the variable means the same as before, since it starts with the old value. |

## Basis

### variable-removed

- New variables go at the end; a variable added before existing ones, or a variable removed, breaks the layout of what follows it. (Writing Upgradeable Contracts \(OpenZeppelin Upgrades Plugins documentation\), <https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable>)
- A variable removed from the end leaves its storage as it was, and a variable added there later starts with the old value. (Writing Upgradeable Contracts \(OpenZeppelin Upgrades Plugins documentation\), <https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable>)
- Constant, immutable and transient variables are kept elsewhere and play no part in the storage layout, so they are not in it. (Layout of State Variables in Storage and Transient Storage \(Solidity documentation\), <https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html>)

### namespace-removed

- Namespaced storage puts the variables of a contract in structs annotated with an erc7201 storage location, and a change inside a namespace is held to the same rules as a change to the ordinary layout. (Writing Upgradeable Contracts \(OpenZeppelin Upgrades Plugins documentation\), <https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable>)
- ERC-7201 marks a namespace with the annotation @custom:storage-location erc7201:\<id\> and derives its root slot from the id; the variables of the namespace follow the ordinary layout rules from that root. (ERC-7201: Namespaced Storage Layout, <https://eips.ethereum.org/EIPS/eip-7201>)
- The layout format of OpenZeppelin Upgrades adds an optional namespaces object of storage lists to the compiler form, and lets an enum type list its members as strings. (The storage layout format of OpenZeppelin Upgrades \(packages/core/src/storage/layout.ts\), <https://github.com/OpenZeppelin/openzeppelin-upgrades/blob/master/packages/core/src/storage/layout.ts>)
- A variable removed from the end leaves its storage as it was, and a variable added there later starts with the old value. (Writing Upgradeable Contracts \(OpenZeppelin Upgrades Plugins documentation\), <https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable>)

### inheritance-order-changed

- Under inheritance the variables are ordered by the C3 linearization of the contracts, beginning with the most base-ward one, so the order of the base contracts decides where each variable is kept. (Layout of State Variables in Storage and Transient Storage \(Solidity documentation\), <https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html>)
- Swapping the order of the base contracts, or adding a base contract, changes where the variables are kept. (Writing Upgradeable Contracts \(OpenZeppelin Upgrades Plugins documentation\), <https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable>)

### variable-moved

- State variables are placed one after another from slot 0, and small values share a slot where they fit, so the place of a variable follows from every variable declared before it. (Layout of State Variables in Storage and Transient Storage \(Solidity documentation\), <https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html>)
- A new version may not change the order in which the state variables are declared or their types; doing so mixes up the stored values. (Writing Upgradeable Contracts \(OpenZeppelin Upgrades Plugins documentation\), <https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable>)
- Two versions of a logic contract collide when the new one keeps another variable where the old one kept a value, so a new version extends storage and never modifies it. (Proxy Upgrade Pattern \(OpenZeppelin Upgrades Plugins documentation\), <https://docs.openzeppelin.com/upgrades-plugins/proxies>)

### gap-mismatch

- A storage gap is a fixed-size array named \_\_gap, or with a name starting with \_\_gap\_, that reserves slots in a base contract; when variables are added, the gap is cut by the slots they take under the packing rules. (Writing Upgradeable Contracts \(OpenZeppelin Upgrades Plugins documentation\), <https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable>)
- A variable added to a base contract takes the slot that a variable of the child had, unless the base reserved room for it. (Writing Upgradeable Contracts \(OpenZeppelin Upgrades Plugins documentation\), <https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable>)

### variable-inserted

- New variables go at the end; a variable added before existing ones, or a variable removed, breaks the layout of what follows it. (Writing Upgradeable Contracts \(OpenZeppelin Upgrades Plugins documentation\), <https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable>)
- A variable added to a base contract takes the slot that a variable of the child had, unless the base reserved room for it. (Writing Upgradeable Contracts \(OpenZeppelin Upgrades Plugins documentation\), <https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable>)
- Two versions of a logic contract collide when the new one keeps another variable where the old one kept a value, so a new version extends storage and never modifies it. (Proxy Upgrade Pattern \(OpenZeppelin Upgrades Plugins documentation\), <https://docs.openzeppelin.com/upgrades-plugins/proxies>)

### type-changed

- A new version may not change the order in which the state variables are declared or their types; doing so mixes up the stored values. (Writing Upgradeable Contracts \(OpenZeppelin Upgrades Plugins documentation\), <https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable>)
- The size of a value type sets how many bytes it takes and whether the next variable shares its slot; a struct or an array always opens a new slot, and so does the variable after it. (Layout of State Variables in Storage and Transient Storage \(Solidity documentation\), <https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html>)
- A mapping or a dynamic array takes one slot in the sequence, and its contents are kept at slots computed with keccak256 from that slot and, for a mapping, from the key. (Layout of State Variables in Storage and Transient Storage \(Solidity documentation\), <https://docs.soliditylang.org/en/latest/internals/layout_in_storage.html>)

### gap-removed

- A storage gap is a fixed-size array named \_\_gap, or with a name starting with \_\_gap\_, that reserves slots in a base contract; when variables are added, the gap is cut by the slots they take under the packing rules. (Writing Upgradeable Contracts \(OpenZeppelin Upgrades Plugins documentation\), <https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable>)
- The tool's own choice: keeping a gap in every contract that had one is a best practice of this tool, not a rule in the Solidity or OpenZeppelin documentation; the OpenZeppelin page describes gaps as a convention

### variable-renamed

- A renamed variable keeps the value of the old one after the upgrade, which is right only when the two mean the same. (Writing Upgradeable Contracts \(OpenZeppelin Upgrades Plugins documentation\), <https://docs.openzeppelin.com/upgrades-plugins/writing-upgradeable>)

This report is an input to a review before an upgrade is deployed: not a security audit and not a guarantee that the upgrade is safe.
