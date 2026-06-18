# Lockblock

Lockblock keeps sensitive Obsidian note sections encrypted until you choose to reveal or edit them.

## What it does

- Encrypts fenced `lockblock` code blocks with a random vault key.
- Stores wrapped key material in Obsidian `secretStorage`.
- Uses your unlock password only to unlock the vault key.
- Shows encrypted blocks as locked cards in reading view.
- Reveals or copies plaintext on demand without changing the note file.
- Shows plaintext in source/edit mode only while the vault is unlocked.
- Protects sealed blocks from accidental edits while the vault is locked.

## Usage

Run **Lockblock: Setup** once. Lockblock creates a random vault key, protects it with your unlock password, stores wrapped key material in Obsidian `secretStorage`, and shows a recovery key.

Write secrets in fenced `lockblock` blocks:

````md
```lockblock
secret text
multiple lines
```
````

When the vault is unlocked, Lockblock can seal plaintext blocks when you enter reading view, when you lock the vault, or when you run **Lockblock: Encrypt plaintext blocks in current note**.

Sealed blocks look like this in the note file:

````md
```lockblock
lockblock:v1:kid=7b9d5d9a-2f70-4cc9-8e77-08713d8b93d6:alg=AES-GCM:iv=<base64url>:ct=<base64url>
```
````

In reading view, sealed blocks render as Lockblock cards with actions to show, hide, copy, or lock. Showing a block reveals plaintext in the UI only; it does not write plaintext back to the note.

In source or live preview editing, sealed blocks are editable only after the vault is unlocked. If the vault is locked, Lockblock blocks edits that touch sealed ciphertext and offers an unlock action.

## Commands

See [docs/commands.md](docs/commands.md) for a quick TLDR of every command.

## Requirements

Lockblock requires Obsidian `1.11.4` or newer for `app.secretStorage`.

## Development

```sh
npm install
npm run dev
```

For a production build:

```sh
npm run build
```
