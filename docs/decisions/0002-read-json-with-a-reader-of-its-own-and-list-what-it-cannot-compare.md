# 2. Read JSON with a reader of its own, and list what it cannot compare

## Status

Accepted

## Context

The facts the checks need sit in the layout files: the slot, offset and type of every variable and the size and parts of
every type. `JSON.parse` would read them, but it keeps no line and column, so a finding could not point at the line of a
variable; it takes the last of two values written under one key without a word; and it builds objects whose keys come
from the file, which has to be trusted not to be moved by a key such as `__proto__`. A layout that is not complete (a
variable with no slot, a type that is not in the types) would be read as if it were, and a check could take a value it
never saw for one that is fine.

A JSON reader written for this tool can keep the line and column of every value, refuse a key written twice, keep the
keys of a file as names in lists, and stop at limits with a stack of its own.

## Decision

1. The files are read by src/json.js, a reader of the tool's own for strict JSON, with the line and column of every
   value, a key written twice as an error, and limits of nesting, values and string length. It does not recurse.
2. Every part of a layout the comparison needs and the file does not give is returned with its line and shown as a
   `layout-incomplete` finding. A check never takes a value it did not read for one that is fine.
3. A file that is not JSON, or holds no layout, stops its side with one `layout-unreadable` finding and a line; the tool
   does not guess at the rest of the file and does not compare the two layouts.
4. Two types are compared by what they hold, never by their ids, and the comparison stops at 64 levels and at a pair it
   is already comparing. The checks are a heuristic over the layouts as written, and every report says so;
   docs/method.md says what each check reads and docs/limits.md what it cannot see. The result is an input to a review
   before an upgrade is deployed: not a security audit and not a guarantee that the upgrade is safe.

## Consequences

- The tool needs no install and no network, and the same files give the same report on Linux, Windows and macOS.
- A finding points at the line of the variable, in the old file or in the new one.
- A layout that lacks a part gets findings that say so, and that part is not compared; the fix is to give the layout as
  the compiler writes it.
- What only the compiler or the source knows is not seen (docs/limits.md).
