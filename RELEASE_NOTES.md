# Lockblock 0.3.12

Lockblock `0.3.12` fixes reading-view cards for `lockblock` fenced blocks in vaults where the previous DOM scan missed rendered code blocks.

## Highlights

- Fixed missing Lockblock reading-view cards and action buttons by using Obsidian's fenced-code block processor.
- Confirmed the change does not alter block parsing, encryption, decryption, keyring storage, or sealed block format.
- No sealed block, keyring, recovery key, or encryption format changes.
