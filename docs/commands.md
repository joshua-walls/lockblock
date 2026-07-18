# Lockblock commands

Quick reference for the command palette.

| Command | What it does |
| --- | --- |
| Lockblock: Setup | Creates the vault key, protects it with your unlock password, stores wrapped key material in Obsidian secret storage, and shows a recovery key. |
| Lockblock: Unlock | Prompts for your unlock password and keeps the decrypted vault key in memory for this session. |
| Lockblock: Lock | Removes the decrypted vault key from memory and hides revealed blocks. |
| Lockblock: Encrypt plaintext blocks in current note | Finds plaintext `lockblock` code blocks in the active note and replaces them with sealed Lockblock ciphertext. |
| Lockblock: Insert empty block | Inserts an empty `lockblock` fenced code block at the cursor. |
| Lockblock: Reveal selected block | Decrypts the selected block for viewing without changing the note. |
| Lockblock: Copy selected block | Decrypts the selected block and copies the plaintext without needing to reveal it on screen. |
| Lockblock: Hide revealed blocks | Hides any plaintext currently shown in Lockblock preview cards. |
| Lockblock: Decrypt selected block to raw plaintext | Replaces the selected sealed block with raw plaintext in the note after confirmation. |
| Lockblock: Change unlock password | Re-wraps the vault key with a new unlock password. Existing encrypted blocks do not change. |
| Lockblock: Show recovery key | Verifies your password, creates a fresh recovery key, and shows it for safe storage. |
| Lockblock: Restore from recovery key | Uses a recovery key to regain access and set a new unlock password. |
| Lockblock: Sync keyring to plugin settings | Writes the wrapped keyring backup into Lockblock plugin settings for devices that sync plugin settings. |
| Lockblock: Import synced keyring | Replaces this device's local keyring with the synced wrapped keyring from plugin settings. |
| Lockblock: Rotate vault key | Reserved for a future migration flow that will re-encrypt blocks with a new vault key. |
| Lockblock: Forget session keys | Immediately removes decrypted session key material from memory. |

## Where to start

Use **Setup** first, then **Insert empty block** to create a blank fenced block. Run **Encrypt plaintext blocks in current note** after writing sensitive content inside it.

For normal reading, use preview-card buttons or **Reveal selected block** / **Copy selected block**.

Use **Decrypt selected block to raw plaintext** only when you intentionally want the secret back in readable markdown.
