# Limits

The tool is not an auditor. It reads two storage layout files, and its result is an input to a review before an upgrade
is deployed: not a security audit and not a guarantee that the upgrade is safe. A clean run means only that none of the
changes in [method.md](method.md) were found between the two files.

## What it cannot see

- **The contract that is deployed.** It compares the files it is given. Whether the old file is the layout of the code
  behind the proxy today, and whether the new file is the layout of the code that will be deployed, is for the team to
  make sure; build both from the commits that are tagged for them.
- **The meaning of the data.** A renamed variable, a type renamed with the same storage form, and members appended to a
  struct or an enum are notes: the storage stays in place, but only the team knows whether the values still mean what
  the code now reads them as.
- **Enum members in the compiler output.** The compiler names an enum and its size, not its members. An enum whose
  members were removed or reordered is seen only when the layout lists the members, as the OpenZeppelin layout format
  does; otherwise only a change of size or of name is seen.
- **What a user-defined value type wraps.** The compiler output gives its name and its size. When the layout does not
  name the underlying type, a change from `uint256` to a value type of 32 bytes is a note that asks to confirm it.
- **The namespaces the layout does not hold.** The compiler output has no ERC-7201 namespaces; they are compared only
  when the layout carries them in a `namespaces` object. The tool does not compute the root slot of a namespace from its
  id, and it does not check that two namespaces or a namespace and the ordinary storage do not collide.
- **Storage written by code outside the layout.** Assembly that writes to a slot of its own (`sstore`), a library that
  takes a storage pointer, a diamond facet with storage of its own: none of it is in the layout.
- **The proxy itself.** The tool checks the ERC-1967 slots against the ordinary storage of the new layout. It does not
  read the proxy, its admin, its beacon or the upgrade function, and it does not check initializers, constructors,
  `selfdestruct` or `delegatecall` in the code.
- **Transient storage.** `transientStorageLayout` is not read; only the storage layout is compared.
- **Variables placed in bytes no old variable used.** A new variable that the compiler packs into free bytes of a slot
  is not reported, because those bytes held nothing in the old version.
- **One finding for each moved variable.** A variable inserted near the start moves every variable after it, and each of
  them is a `variable-moved` finding. Fix the first finding of a contract and run the tool again.
- **Another compiler's rules.** The pages the checks rest on are the latest Solidity documentation and the OpenZeppelin
  documentation. A layout written by another compiler (Vyper, for example) is read if it has the same fields, but the
  tool does not know its rules.

## What the JSON reader does not read

[inputs.md](inputs.md) lists the forms. A file that is not strict JSON is one `layout-unreadable` finding, and the two
layouts are not compared. A part of a layout that lacks what the comparison needs is a `layout-incomplete` finding, and
that part is not compared: a clean run says nothing about it.

## Size limits

| Limit | Value |
| --- | --- |
| file size | 16 MB |
| nesting of objects and arrays | 1,000 levels |
| values (nodes) in a file | 2,000,000 |
| a string | 1,000,000 characters |
| a type id | 4,000 characters |
| nesting of types compared | 64 levels |
| a slot | 80 decimal digits |

Input past a limit is a `layout-unreadable` or `layout-incomplete` finding or, for the file size, an input error with
exit code `2`. The tool never passes a run because something could not be read. A compiler output with the syntax trees
and the bytecode of a large project can pass the file size limit; ask the compiler for `storageLayout` alone, or use
`forge inspect`.

## What a run does not do

It fetches nothing and connects to nothing, compiles nothing, runs no program, evaluates nothing it reads, reads no clock
and no locale, follows no symbolic link and writes nothing to disk. [threat-model.md](threat-model.md) lists the risks of
reading files from a pull request and their controls.
