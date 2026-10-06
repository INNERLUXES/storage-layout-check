# Threat model

The tool is an input to a review before an upgrade is deployed: not a security audit and not a guarantee that the
upgrade is safe. This document is about the tool itself: what it touches, what a hostile layout file can try, and what
stops it.

## What the tool touches

- It reads the two files named on the command line. Nothing else is opened: the source paths written in a layout
  (`src/Vault.sol:Vault`) are read as text and never opened, and no other file is read.
- It writes the report to standard output and its errors to standard error. It writes nothing to disk.
- It opens no network connection, fetches no URL it reads, follows no symbolic link, compiles nothing, runs nothing it
  reads, evaluates nothing and reads no clock and no locale.

## What the input may hold

The layouts come from a repository or a build, and in a pipeline that checks every pull request the new layout, and
perhaps the old one, may be written by whoever opened the pull request. Through them, a person can try to:

- make the tool read outside the files: a link named on the command line, a folder, an address given as the path;
- exhaust the memory, the stack or the time: a file of many megabytes, arrays and objects nested very deep, millions of
  values, very long strings, type ids nested very deep or longer than any real one, a struct that refers to itself,
  thousands of variables with one name or at one place, slots far larger than the storage space;
- move the result: a key written twice so that two readers see two values, a variable with no slot that might be taken
  as fine, a type that is missing, a layout edited to match the new code, a compiler output with several contracts in
  the hope that the wrong one is compared, a namespace that stands in for another;
- slip in something that is not text: a binary file named `.json`, bytes that are not valid UTF-8 or UTF-16;
- rewrite the terminal or break the output: control characters, escape sequences, direction controls and line separators
  in a variable, a contract, a type or a namespace;
- hide markup in the markdown report: a link, a table separator or a tag in a name;
- change how objects behave: a key, a variable, a contract, a type id or a namespace named `__proto__`, `constructor` or
  `toString`.

## What could go wrong, and what stops it

| Risk | Control |
| --- | --- |
| A link makes the tool read a file it was not given | The path is checked with `lstat` and a link is refused by name; the file is opened with `O_NOFOLLOW` where the system has it, and its type and size are taken from the open handle. A test puts a link in the folder |
| The tool fetches, connects or runs something | No module of the network or of child processes is imported, nothing is evaluated, and a path that looks like an address is refused. A test checks the imports of src |
| The memory, the stack or the time is exhausted | The file has a size limit checked on the open handle before it is read; the JSON reader keeps a stack of its own with limits of nesting, values and string length; type ids have a length limit and the type comparison stops at 64 levels and at a pair already being compared; variables are paired through maps, and the overlap of new and old variables is found in a sorted list. Tests check the time, with limits that widen under coverage only |
| A key written twice hides a value | A key written twice in one object is a `layout-unreadable` finding; the tool never picks one of the two |
| A part of a layout that is missing passes for one that is fine | A variable or a type that lacks what the comparison needs is a `layout-incomplete` finding with its line; a file that is not a layout is a `layout-unreadable` finding that fails the run |
| The wrong contract of a compiler output is compared | Several contracts with no `--contract`, or a name that matches none or two, stop the run with the list of contracts |
| A layout edited to match the new code | Out of reach of a tool that reads files; docs/secure-defaults.md says to build the layouts in the pipeline and to protect the kept layout with CODEOWNERS |
| A binary file or bytes in another encoding are read as text | A null byte in UTF-8, an odd number of bytes in UTF-16 and bytes that are not valid make the file an input error with exit code `2` and no report |
| Text from a file rewrites the terminal | Every text from the input goes through `safeText`, which replaces control, line separator and direction characters and caps the length. A test puts escapes and direction controls in a variable, a contract and a type, in every format |
| Markup in a name changes the markdown report | The markdown report escapes the characters markdown gives a meaning to. A test writes a link into a variable name |
| `__proto__` changes how objects behave | Objects of a file are lists of entries searched by key, types and pairs are kept in maps, and no object is built with a key from a file. A test uses `__proto__`, `constructor`, `toString` and `hasOwnProperty` as names |
| A device or a pipe hangs the tool | A path that is not a regular file is refused before it is read |
| The tool leaves files behind | Nothing is written to disk; there is no cache, no temporary file and no log. A test checks that a run leaves the folder as it was |

## Out of scope

Whether the upgrade is safe, what the new code does with the values it reads, the forms docs/limits.md leaves out, who
may change the layouts and the source in your repository, and where your pipeline keeps the output.
