# 0.3.11

## Added

- Added a setting to suppress Lockblock notification popups while keeping dialogs and confirmations visible.

# 0.3.10

## Added

- Added an **Insert empty block** command to insert an empty `lockblock` fenced code block at the cursor.

## Changed

- Added dual-version settings definitions so Lockblock settings remain available on Obsidian 1.11.4 and appear in settings search on Obsidian 1.13.0 or newer.
- Empty plaintext `lockblock` fences now stay unsealed until content is added.

## Development

- Updated lint validation to cover plugin source, manifest, styles, and JSON metadata with current Obsidian lint rules.

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
