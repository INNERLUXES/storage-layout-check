# 1. Read no clock, and keep dates out of the repository

## Status

Accepted

## Context

A layout check tempts a tool to look at the calendar: when a version was deployed, how long a layout has been kept, which
release of the compiler was the newest on a day. Each of these would make the same two files give a different result on
a different day, so a pipeline that passed yesterday could fail today with no change to the repository, and two people
reading the same commit could see two reports. The output could never be saved and compared.

The checks do not need a date. Whether a variable moved, whether a type has another size, whether a gap was cut by the
right number of slots can all be read from the two files as they are. The public pages the checks rest on are named by
addresses that hold no year: the Solidity documentation at its latest version, the OpenZeppelin Upgrades Plugins
documentation, the master branch of the OpenZeppelin Upgrades repository, the ERC pages and the Foundry reference.

## Decision

1. The tool reads no clock, no time zone and no locale. It never prints the current time and never says when a page, a
   release or a version was published. The same files give the same output on every machine and on every day.
2. No document, example or test of this repository holds a date or a number that reads like a year: not the licence, not
   the changelog, not the documents, not the comments of the code, not the examples. `npm run check` and a test fail on
   any word of four digits that starts with 19 or 20. The saved copies of the public pages under research/sources are
   the pages' own words and are the one place the check does not read for prose; the date lines of the ERC pages were
   left out of the copies.
3. A version or the number of a standard is not a year and is not caught: 1.0.0, Node 22, a slot such as 118 and
   ERC-1967, where the number follows EIP or ERC, hold no year. A test of test/repo.test.js runs the pattern over such
   values and checks that none of them is caught, and that a year in the same place still is.
4. The sources are chosen with addresses that hold no year, and the notes on them name no publication date.

## Consequences

- The output of a run can be saved in the repository (`examples/output`) and compared on every change, because it does
  not move with the calendar.
- The report holds no date and no deadline; a team puts dates in its own plan.
- The examples use slots, sizes and ids that do not read like a year, and a check catches one that does.
