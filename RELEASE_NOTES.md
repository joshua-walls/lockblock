# Lockblock 0.3.0

Lockblock `0.3.0` is the first wrapped local release candidate for encrypted note blocks.

## Highlights

- Uses fenced `lockblock` blocks as the only supported authoring format.
- Encrypts block contents with AES-GCM using a random 256-bit vault key.
- Protects vault key material with an unlock password and Obsidian `secretStorage`.
- Shows sealed blocks as locked cards in reading view with show, hide, copy, and lock actions.
- Keeps plaintext reveals in the UI unless you explicitly decrypt a block back to raw markdown.
- Shows decrypted block contents in source/edit mode when the vault is unlocked.
- Blocks edits to sealed ciphertext while the vault is locked and offers an unlock action.
- Supports setup, unlock, lock, password changes, recovery-key restore, recovery-key display, and session key forgetting.

## Notes

- Obsidian `1.11.4` or newer is required.
- Vault-key rotation is intentionally reserved for a later migration flow.
- Live Preview uses Obsidian's source-style code block editing for Lockblock blocks.
