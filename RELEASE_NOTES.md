# Lockblock 0.3.7

Lockblock `0.3.7` is a maintenance release for release reliability and lint cleanup.

## Highlights

- Removed an unnecessary crypto buffer type assertion reported by Obsidian lint.
- Added release-branch safeguards so published release branches start from the latest `main`.
- Release publishing now stops early when the working tree or release branch state could cause avoidable merge conflicts.
