# Security

## Reporting a problem

Write to info@innerluxes.dev with the subject line "storage-layout-check security", or use private vulnerability
reporting on this repository. Please do not open a public issue for a vulnerability.

Include two small made-up layout files that show the problem, the command you ran, what you expected and what happened.
Use made-up contracts and names, never the layout of a contract that is deployed with value in it, and never a real key,
address or token, even an old one.

## Scope

In scope:

- an input that makes the tool read a file other than the two it was given, open a source file a layout names, or follow
  a symbolic link
- an input that makes the tool open a network connection, fetch a URL it reads, call a node, compile or run any other
  program, or evaluate anything it reads
- an input that makes the tool write a file
- an input that makes the tool hang, take very long, exhaust the stack or use unbounded memory, such as very large files,
  arrays and objects nested deep, very long strings, type ids nested deep, structs that refer to themselves, or many
  thousands of variables with one name or at one place
- binary or invalid input that the tool reads as if it were JSON
- a part of a layout the tool did not read that a check reports as fine, or a key written twice whose second value is
  taken without a finding
- a change that docs/method.md says is reported but that a form of layout it says it reads hides from the tool
- a run that passes at a `--fail-on` level although the input holds a finding at that level that docs/method.md says is
  reported
- a run that compares a contract other than the one named with `--contract`
- text from a file or a file name that rewrites the terminal through control or direction characters, is shown unescaped
  in the output, or puts markup into the markdown report
- a name such as `__proto__` that changes how objects behave inside the tool

Out of scope: the forms docs/limits.md says the tool does not see, whether the upgrade is safe (a clean result is not a
security audit and not a guarantee that the upgrade is safe), whether the old layout is the one deployed, who may change
the layouts in your repository, and where your pipeline keeps the output.

Read [docs/threat-model.md](docs/threat-model.md) for the rest.
