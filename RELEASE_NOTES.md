# Lockblock 0.3.14

Lockblock `0.3.14` adds the reading-view **Encrypt** action for plaintext `lockblock` blocks. When the vault is locked, the action prompts for unlock before sealing the block through the existing encryption flow.

# Lockblock 0.3.13

Lockblock `0.3.13` adds an **Encrypt** button to plaintext `lockblock` cards in reading view. The button unlocks the vault when needed and seals the block using the existing encryption flow.

# Lockblock 0.3.12

Lockblock `0.3.12` fixes reading-view cards for `lockblock` fenced blocks in vaults where the previous DOM scan missed rendered code blocks.

## Highlights

- Fixed missing Lockblock reading-view cards and action buttons by using Obsidian's fenced-code block processor.
- Confirmed the change does not alter block parsing, encryption, decryption, keyring storage, or sealed block format.
- No sealed block, keyring, recovery key, or encryption format changes.
