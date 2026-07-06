# 0.3.9

## Changed

- Added a desktop status bar item that shows Lockblock setup, lock, unlock, and background-lock state with a click action.
- Added editor context menu actions for selected `lockblock` fences: reveal, copy plaintext, encrypt, and decrypt to raw plaintext.
- Added Obsidian/Lucide icons to status, context menu, and reading-view card actions.
- Polished settings sections and descriptions while keeping the Obsidian 1.11.4-compatible imperative settings API.

## Compatibility

- Requires Obsidian `1.11.4` or newer.

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
