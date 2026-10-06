# storage-layout-check: examples/v1/layout.json -> examples/v2-good/layout.json

- Old: 327 lines, 7,604 bytes, a storage layout; 15 variables in 4 contracts, 5 variables in 2 namespaces
- New: 378 lines, 8,751 bytes, a storage layout; 18 variables in 4 contracts, 7 variables in 3 namespaces
- Findings: 4 \(4 info\)
- Result: **PASS - no finding at or above error \(4 info\)**

## Findings

| Level | Check | Where | Message |
| --- | --- | --- | --- |
| info | type-extended | examples/v2-good/layout.json:94 | The type of Vault.positions grows without moving what was stored: rewardDebt is appended to struct Vault.Position, which is stored as the value of a mapping, so each entry grows at its own hashed slot. This is a best practice of this tool, not a rule in the Solidity or OpenZeppelin documentation. Fix: Confirm that the code handles what was stored before the upgrade: appended struct members read as zero there. |
| info | type-extended | examples/v2-good/layout.json:110 | The type of Vault.mode grows without moving what was stored: Retired is appended to enum Vault.Mode, and the old members keep their numbers. This is a best practice of this tool, not a rule in the Solidity or OpenZeppelin documentation. Fix: Confirm that the code handles what was stored before the upgrade: appended struct members read as zero there. |
| info | variable-renamed | examples/v2-good/layout.json:126 | Vault.note is renamed memo at the same slot 117, offset 0 with the same storage form, so memo starts with the value of note. Fix: Confirm that the variable means the same as before, since it starts with the old value. |
| info | type-renamed | examples/v2-good/layout.json:335 | The type of token in namespace erc7201:example.vault.rewards keeps its storage form: contract IERC20 is now address, with the same storage form. This is a best practice of this tool, not a rule in the Solidity or OpenZeppelin documentation. Fix: Confirm that the stored values mean the same under the new type. |

This report is an input to a review before an upgrade is deployed: not a security audit and not a guarantee that the upgrade is safe.
