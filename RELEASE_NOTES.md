# Lockblock 0.3.8

Lockblock `0.3.8` adds a small public integration surface for other Obsidian plugins, plus release reliability and lint cleanup.

## Highlights

- Other plugins can now read vault lock state through `isUnlocked()` and `getVaultLockState()` instead of touching internal keyring session state.
- Other plugins can subscribe to lock-state changes with `onLockStateChange()`.
- The `Unlock` and `Lock` commands now expose state-aware Obsidian command availability with `checkCallback`.
- Removed an unnecessary crypto buffer type assertion reported by Obsidian lint.
- Added release-branch safeguards so published release branches start from the latest `main`.
- Release publishing now stops early when the working tree or release branch state could cause avoidable merge conflicts.
