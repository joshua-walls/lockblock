import { findEncryptedBlocks, formatSealedBlock, serializeSealedHeader } from "./blocks";
import { SEALED_PREFIX } from "./constants";
import { encryptBlock } from "./crypto";
import type { EncryptedBlock, SealedBlockHeader, SessionKeys } from "./types";

const DEFAULT_MAX_ATTEMPTS = 3;

export interface AtomicTextStore {
  read(): Promise<string>;
  process(transform: (current: string) => string): Promise<string>;
}

export type BlockEncryptor = (plaintext: string, vaultKey: CryptoKey, kid: string) => Promise<SealedBlockHeader>;

export async function encryptPlaintextBlocksAtomically(
  store: AtomicTextStore,
  getSession: () => SessionKeys | null,
  encrypt: BlockEncryptor = encryptBlock,
  maxAttempts = DEFAULT_MAX_ATTEMPTS,
): Promise<number> {
  if (!Number.isInteger(maxAttempts) || maxAttempts < 1) {
    throw new Error("Atomic encryption requires at least one attempt.");
  }

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    const session = getSession();
    if (!session) {
      return 0;
    }

    const snapshot = await store.read();
    const plaintextBlocks = plaintextBlocksIn(snapshot);
    if (plaintextBlocks.length === 0) {
      return 0;
    }

    const replacements: Array<{ block: EncryptedBlock; replacement: string }> = [];
    for (const block of plaintextBlocks) {
      if (getSession() !== session) {
        return 0;
      }

      const sealed = await encrypt(block.body, session.vaultKey, session.kid);
      replacements.push({ block, replacement: formatSealedBlock(block, serializeSealedHeader(sealed)) });
    }

    if (getSession() !== session) {
      return 0;
    }

    try {
      await store.process((current) => {
        if (getSession() !== session) {
          throw new SessionChangedError();
        }
        if (current !== snapshot) {
          throw new ContentChangedError();
        }

        return applyReplacements(snapshot, replacements);
      });
      return replacements.length;
    } catch (error) {
      if (error instanceof SessionChangedError) {
        return 0;
      }
      if (error instanceof ContentChangedError) {
        continue;
      }
      throw error;
    }
  }

  throw new Error("The note kept changing while Lockblock was encrypting it. Try again.");
}

function plaintextBlocksIn(markdown: string): EncryptedBlock[] {
  return findEncryptedBlocks(markdown).filter((block) => {
    const body = block.body.trim();
    return block.header === null && body.length > 0 && !body.startsWith(SEALED_PREFIX);
  });
}

function applyReplacements(
  markdown: string,
  replacements: Array<{ block: EncryptedBlock; replacement: string }>,
): string {
  let nextMarkdown = markdown;
  for (const { block, replacement } of replacements.reverse()) {
    nextMarkdown = `${nextMarkdown.slice(0, block.from)}${replacement}${nextMarkdown.slice(block.to)}`;
  }
  return nextMarkdown;
}

class ContentChangedError extends Error {}
class SessionChangedError extends Error {}
