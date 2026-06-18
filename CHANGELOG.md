# 0.3.0

## Added

- Initial Lockblock plugin release candidate for encrypted Obsidian note blocks.
- Support for fenced `lockblock` blocks.
- AES-GCM block encryption with a random 256-bit vault key.
- Password-wrapped vault key storage through Obsidian `secretStorage`.
- Recovery key setup, display, and restore flows.
- Reading-view Lockblock cards for sealed blocks.
- Show, hide, copy, and lock actions from reading-view cards.
- Command palette actions for setup, unlock, lock, encrypting plaintext blocks, revealing, copying, hiding, decrypting to raw plaintext, password changes, recovery, vault-key rotation placeholder, and forgetting session keys.
- Settings controls for reading-view sealing, reveal auto-hide timing, copy behavior, decrypt-to-raw confirmation, background locking, unlocked-session timeout, password wrapping iterations, and global command buttons.
- Source/edit mode decrypted plaintext display while the vault is unlocked.
- Edit protection for sealed ciphertext while the vault is locked, including an unlock action in the warning notice.
- Local release script support for building, zipping, and preparing release branches.
- GitHub release workflow support for tagging merged release branches and publishing release assets.

## Changed

- Lockblock uses `lockblock` as the only supported code fence language.
- Live Preview keeps Obsidian's source-style code block editing behavior for Lockblock blocks.
- Plaintext blocks are sealed when entering reading view, locking the vault, or running the manual encrypt command.

## Compatibility

- Requires Obsidian `1.11.4` or newer.
- No migration is included for older experimental `encrypted` fences.
- Vault-key rotation is reserved for a later migration flow.
