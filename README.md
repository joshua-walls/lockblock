# Lockblock

Lockblock keeps sensitive Obsidian note sections encrypted until you choose to reveal them.

## Usage

Write secrets in fenced `lockblock` blocks:

````md
```lockblock
secret text
multiple lines
```
````

Run **Lockblock: Setup** once. Lockblock creates a random vault key, wraps it with your unlock password, stores the wrapped key material in Obsidian `secretStorage`, and shows a recovery key.

When unlocked, run **Lockblock: Encrypt plaintext blocks in current note** or leave auto-encrypt enabled. Sealed blocks look like this:

````md
```lockblock
lockblock:v1:kid=7b9d5d9a-2f70-4cc9-8e77-08713d8b93d6:alg=AES-GCM:iv=<base64url>:ct=<base64url>
```
````

Use preview cards or commands to reveal, copy, hide, or explicitly decrypt a selected block back to raw plaintext.

See [docs/commands.md](docs/commands.md) for a quick TLDR of every command.

## Development

```sh
npm install
npm run dev
```

For a production build:

```sh
npm run build
```
