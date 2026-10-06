# Inputs

The tool takes two paths: the storage layout of the version that is deployed now (the old one) and the layout of the
version that is to replace it (the new one). There is no configuration file, no environment variable and no standard
input; the options are on the command line.

```
storage-layout-check <old layout> <new layout> [--contract <name>[,<new name>]] [--format text|markdown|json|sarif]
                     [--json] [--min-severity <level>] [--fail-on <level>] [--explain] [--list-checks]
```

| Option | Meaning |
| --- | --- |
| `--contract <name>` | the contract to take from a compiler output that holds several, as `Name` or `path:Name`; `<old>,<new>` names one for each file, and also tells the tool that a contract was renamed between the versions |
| `--format <name>` | `text` (default), `markdown`, `json` or `sarif` |
| `--json` | the same as `--format json` |
| `--min-severity <level>` | the lowest level shown: `info` (default), `warning` or `error` |
| `--fail-on <level>` | the lowest level that fails the run: `info`, `warning` or `error` (default) |
| `--explain` | add the points of the documentation behind each finding to the text, markdown and JSON reports |
| `--list-checks` | list the checks with their level and kind, in text, markdown or JSON, and exit |
| `--help`, `--version` | the usage, the version |

Every option that takes a value takes it once. A value may not start with `--`. `-` (standard input) and an address
such as `https://...` are refused. A folder is refused: name the file. Three paths are a usage error.

## Getting the layout

| Tool | Command | What the file holds |
| --- | --- | --- |
| Foundry | `forge inspect <path>:<Name> storageLayout --json > v2.json` | the storageLayout field as JSON: the layout object |
| solc | `solc --standard-json` with `storageLayout` in the output selection | a compiler output; pick the contract with `--contract` |
| other build tools | a file that keeps the compiler output under `output`, or an artifact with `storageLayout` | a build info file or an artifact |

Keep the layout of every version that is deployed, next to its source, so that the next upgrade can be compared with it.

## The forms that are read

| Form | How it is found |
| --- | --- |
| layout object | an object with `storage` (and `types`), as the compiler writes it and as `forge inspect <contract> storageLayout --json` prints it |
| artifact | an object with `storageLayout`; `contractName` is shown when the artifact has one |
| compiler output | an object with `contracts` (source file -> contract -> `storageLayout`); with more than one contract that has a layout, `--contract` picks one |
| build info file | an object with `output` that holds such a `contracts` object |

In the layout, each variable of `storage` needs `label`, `slot` (a string of decimal digits, or a whole number), `offset`
(0 to 31) and `type` (an id that is in `types`); `contract` is read when it is there. Each type needs `numberOfBytes`;
a mapping needs its key and value (from `key` and `value`, or from its id), an array its base (from `base`, or from its
id), and a struct its `members`. These fields are read when they are there:

| Field | Read as |
| --- | --- |
| `encoding` | `inplace`, `mapping`, `dynamic_array` or `bytes`, with the id, to tell the kind of a type |
| `members` of an enum, as a list of strings | the members of the enum, so that a removed or reordered member is seen |
| `underlying` of a user-defined value type | the type it wraps, compared as that type |
| `namespaces` | an object of storage lists keyed by namespace id, such as `erc7201:example.main`, each compared on its own |

The compiler writes neither enum members, nor underlying types, nor namespaces; the layout format of OpenZeppelin
Upgrades adds them (research/sources/oz-upgrades-core-layout.ts.txt). `transientStorageLayout` is not read: the
Solidity page describes transient storage as a layout of its own that does not interfere with storage.

## What stops the reading

| Problem | Result |
| --- | --- |
| a file that is not strict JSON (a comment, a trailing comma, a single quote, a key written twice in one object, text after the value), or is nested past the limits | one `layout-unreadable` finding with the line and column, and the two layouts are not compared |
| JSON that holds none of the forms above, a compiler output with no `storageLayout`, a `storage` that is not a list | one `layout-unreadable` finding, and the two layouts are not compared |
| a variable with no valid label, slot, offset or type; a type that is not in `types`, is not an object or has no size; a mapping, array or struct without its parts | a `layout-incomplete` finding with the line; that variable or that type is not compared |
| a compiler output with several contracts and no `--contract`, or a name it does not hold | exit code `2`, no report, and the contracts of the file |

Line ends may be LF, CRLF or CR, and the file may be UTF-8 with or without a byte order mark or UTF-16 with one; the same
findings are written for each.

## Output paths

The path shown in a report is relative to the folder the command runs in, with forward slashes on every system, and the
whole path when the file is outside that folder. A finding is `file:line` of the file it is about: a removed variable,
a removed gap and a removed namespace point at the old file, everything else at the new file. The JSON, markdown and
SARIF reports also carry the column, and the JSON report says which side (`old` or `new`) each finding is on.
