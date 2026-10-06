# Method

This document says how the tool reads two storage layouts and what each check looks at. The tool is an input to a review
before an upgrade is deployed: not a security audit and not a guarantee that the upgrade is safe. A clean run means only
that none of the changes below were found between the two files.

## Why the layout

Behind a proxy, the state lives in the proxy and the code in the logic contract; an upgrade swaps the code and keeps the
state. The new code reads the state where its own layout says each variable is, so every variable that the new layout
puts somewhere else, or reads as another type, reads what the old code stored there. The compiler can write the layout
of a contract as JSON, with the slot, offset and type of every variable, which is what the tool compares: the file the
compiler writes, not the source, so the slots are the ones the compiler chose.

## Reading the files

1. Each path is resolved against the folder the command runs in. A link, a folder, a device or a pipe is refused; a file
   over 16 MB is refused before it is read; a file with a null byte, or bytes that are not UTF-8 (or UTF-16 with a byte
   order mark), is refused with exit code `2` and no report.
2. The text goes to a JSON reader of the tool's own (`src/json.js`), which keeps the line and column of every value and
   reads strict JSON: a comment, a trailing comma, a key written twice in one object or text after the value is a
   `layout-unreadable` finding with the line.
3. The layout is found in the file (docs/inputs.md): the layout object, an artifact with `storageLayout`, a compiler
   output with `contracts`, or a build info file with `output`. A compiler output with several layouts needs
   `--contract`.
4. Every variable of `storage`, and of each list of `namespaces`, is read with its contract, label, slot, offset and
   type. A variable that lacks one of them is a `layout-incomplete` finding and is not compared. Types are read when a
   check needs them; a type that is not in `types`, or lacks what its kind needs, is a `layout-incomplete` finding once,
   and the variables of that type are not compared.

## Pairing the variables

The ordinary storage of the old layout is compared with the ordinary storage of the new one, and each namespace with the
namespace of the same id. Inside each, the variables are paired in three passes:

1. **By contract and name.** `FeeBase.treasury` of the old layout is `FeeBase.treasury` of the new one. The contract is
   the name after the last `:` of the `contract` field, so a file that moved to another folder is the same contract.
   When exactly one contract name of the old layout is missing from the new one and exactly one is new, the two are read
   as one contract renamed between versions (`Vault` and `VaultV2`), and a note says so; `--contract <old>,<new>` names
   the pair.
2. **By name alone,** when the name is in one contract of the new layout only: a declaration that moved to another
   contract.
3. **By place,** when a variable of the old layout and one of the new layout with no pair sit at the same slot and offset
   and their types have the same storage form: a renamed variable.

A variable of the old layout with no pair is removed; a variable of the new layout with no pair is new.

## Comparing two types

Two types are compared by what they hold, never by their ids: the number in `t_struct(Position)41_storage` or
`t_enum(Mode)17` is the id of a node of the syntax tree and changes from one build to the next. The result is one of:

- **same**: the same storage form and the same name;
- **renamed**: the same storage form under another name: `address`, `address payable` and a contract type; `string` and
  `bytes`, which the Solidity page says are encoded the same way; a struct, enum or member renamed; a user-defined value
  type and the type it wraps;
- **extended**: members appended to a struct that is stored as the value of a mapping, or that keeps its size, or to an
  enum, with every old member at its place;
- **changed**: another storage form, with the reason: another size; the same size with another signedness (`int128` and
  `uint128`); another type of the same size (`bytes32` and `uint256`); another mapping key or value; another array
  element or length; a struct member removed, moved, replaced or changed; members appended to a struct stored in
  sequence or in an array, so that it grows; enum members removed or reordered;
- **unknown**: the layout does not describe a type well enough, or the types are nested more than 64 deep.

The comparison follows mappings, arrays and struct members down, takes a pair of types it is already comparing as the
same (a struct that refers to itself through a mapping), and stops at 64 levels.

## The checks

Each check says whether it is documented or a best practice. A documented check rests on the Solidity documentation, the
OpenZeppelin Upgrades documentation or an ERC. A best practice check is the tool's own choice; its message says so, and
so does `--list-checks`. [rules-and-sources.md](rules-and-sources.md) lists the pages and the points of each page behind
each check.

| Check | Looks at | Level |
| --- | --- | --- |
| `variable-removed` | a variable of the old layout with no pair, that is not a gap | error |
| `variable-moved` | a pair whose slot or offset differs | error |
| `type-changed` | a pair whose types compare as changed | error |
| `variable-inserted` | a new variable whose bytes overlap the bytes of a variable of the old layout, except the gap of its own contract | error |
| `gap-mismatch` | a gap (`__gap`, or a name that starts with `__gap_`) of one contract in both layouts: the slots between the first variable of the contract and the gap grew by a number other than the slots the gap lost | error |
| `gap-removed` | a gap of the old layout with no pair | warning |
| `inheritance-order-changed` | the order of the contracts, by the first variable of each, in the ordinary storage of each layout; the contracts that are in both must keep their order | error |
| `namespace-removed` | a namespace id of the old layout that is not in the new one | error |
| `proxy-slot-overlap` | a variable of the ordinary storage of the new layout whose slots include one of the three ERC-1967 slots | error |
| `variable-renamed` | a pair made by place, or by name alone at the same slot and offset | info |
| `type-renamed` | a pair whose types compare as renamed | info |
| `type-extended` | a pair whose types compare as extended | info |
| `layout-incomplete` | a variable or a type that lacks what the comparison needs, or a pair of types that compare as unknown | warning |
| `layout-unreadable` | a file that is not JSON the reader can follow, or holds no layout | error |

### Why some levels are what they are

- `variable-removed` is an error even for the last variable. The OpenZeppelin page says the storage of a removed variable
  is not cleared and a variable added there later reads the old value; keeping the declaration costs nothing.
- `variable-inserted` looks at bytes, not at the order of declarations. A new variable that takes the bytes of an old
  one starts with its value, whether it was declared before existing ones, in a base contract with no room, or in the
  place of a removed variable. A new variable in free bytes of a slot, or after the last variable, is not reported.
- `gap-mismatch` counts slots, as the OpenZeppelin page asks ("keeping in mind Solidity's rules on how contiguous items
  are packed"): an `address` added after an `address` takes a new slot, a `bool` added after an `address` does not.
- `gap-removed` is a warning and a best practice. A gap is a convention, and removing one only takes away room; when the
  variables that replace it take exactly its slots, nothing moves, and the warning asks to confirm it.
- `type-renamed` and `type-extended` are notes and best practices: the storage keeps its place, which is the tool's own
  reading of the layout rules, but the code must still read the old values right.
- A struct that grows where it is stored in sequence, or as the element of an array, is `type-changed`: what follows it
  moves, or the elements of the array no longer start where they did.

## Findings

Every finding has `id`, `severity`, `message`, `side` (`old` or `new`), `file`, `line` and `column`, `at`
(`file:line`), the `contract`, `variable` or `namespace` it is about, `fix`, and with `--explain` the points of the
documentation behind it. They are sorted errors first, then the old file before the new one, then by line.
`--min-severity` hides the findings below a level and says how many; a hidden finding still counts for the result. The
result is `FAIL` when a finding is at or above `--fail-on` (default `error`) and `PASS` otherwise.
