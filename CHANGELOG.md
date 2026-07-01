# 0.3.8

## Changed

- Added a public Lockblock plugin integration API for other Obsidian plugins:
  `isUnlocked()`, `getVaultLockState()`, and `onLockStateChange()`.
- The `Unlock` and `Lock` commands now use Obsidian `checkCallback` availability so integrations and the command palette can infer current lock state.
- Removed an unnecessary crypto buffer type assertion reported by Obsidian lint.
- Added release-branch safeguards so published release branches start from the latest `main`.
- Release publishing now stops early when the working tree or release branch state could cause avoidable merge conflicts.

## Compatibility

- Requires Obsidian `1.11.4` or newer.
