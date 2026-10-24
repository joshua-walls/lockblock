import assert from "node:assert/strict";
import test from "node:test";
import { encryptPlaintextBlocksAtomically } from "../src/atomic-encryption";
import { findEncryptedBlocks } from "../src/blocks";
import { decryptBlock, encryptBlock, generateVaultKey } from "../src/crypto";
import type { AtomicTextStore, BlockEncryptor } from "../src/atomic-encryption";
import type { SessionKeys } from "../src/types";

const TEST_KID = "00000000-0000-4000-8000-000000000001";

class MemoryAtomicTextStore implements AtomicTextStore {
  readCalls = 0;
  processCalls = 0;
  beforeProcess: ((store: MemoryAtomicTextStore) => void) | null = null;

  constructor(public value: string) {}

  async read(): Promise<string> {
    this.readCalls += 1;
    return this.value;
  }

  async process(transform: (current: string) => string): Promise<string> {
    this.processCalls += 1;
    this.beforeProcess?.(this);
    const next = transform(this.value);
    this.value = next;
    return next;
  }
}

async function createSession(): Promise<SessionKeys> {
  return { kid: TEST_KID, vaultKey: await generateVaultKey() };
}

test("atomically encrypts multiple blocks and preserves unrelated content", async () => {
  const session = await createSession();
  const store = new MemoryAtomicTextStore([
    "before",
    "```lockblock",
    "synthetic first secret",
    "```",
    "between",
    "~~~lockblock metadata",
    "synthetic second secret",
    "~~~",
    "after",
  ].join("\n"));

  const encrypted = await encryptPlaintextBlocksAtomically(store, () => session);

  assert.equal(encrypted, 2);
  assert.equal(store.readCalls, 1);
  assert.equal(store.processCalls, 1);
  assert.match(store.value, /^before\n/);
  assert.match(store.value, /\nbetween\n/);
  assert.match(store.value, /\nafter$/);
  assert.equal(store.value.includes("synthetic first secret"), false);
  assert.equal(store.value.includes("synthetic second secret"), false);

  const blocks = findEncryptedBlocks(store.value);
  assert.equal(blocks.length, 2);
  assert.ok(blocks[0].header);
  assert.ok(blocks[1].header);
  assert.equal(await decryptBlock(blocks[0].header, session.vaultKey), "synthetic first secret");
  assert.equal(await decryptBlock(blocks[1].header, session.vaultKey), "synthetic second secret");
});

test("retries from fresh content and preserves a concurrent outside edit", async () => {
  const session = await createSession();
  const store = new MemoryAtomicTextStore("before\n```lockblock\nsynthetic secret\n```\nafter");
  store.beforeProcess = (currentStore) => {
    if (currentStore.processCalls === 1) {
      currentStore.value = currentStore.value.replace("before", "concurrent edit\nbefore");
    }
  };

  const encrypted = await encryptPlaintextBlocksAtomically(store, () => session);

  assert.equal(encrypted, 1);
  assert.equal(store.readCalls, 2);
  assert.equal(store.processCalls, 2);
  assert.match(store.value, /^concurrent edit\nbefore\n/);
  assert.equal(store.value.includes("synthetic secret"), false);
  assert.equal(findEncryptedBlocks(store.value)[0].sealed, true);
});

test("does not read or write when the session is already locked", async () => {
  const original = "before\n```lockblock\nsynthetic secret\n```\nafter";
  const store = new MemoryAtomicTextStore(original);

  const encrypted = await encryptPlaintextBlocksAtomically(store, () => null);

  assert.equal(encrypted, 0);
  assert.equal(store.readCalls, 0);
  assert.equal(store.processCalls, 0);
  assert.equal(store.value, original);
});

test("does not write when the session locks during encryption", async () => {
  let session: SessionKeys | null = await createSession();
  const original = "before\n```lockblock\nsynthetic secret\n```\nafter";
  const store = new MemoryAtomicTextStore(original);
  const lockDuringEncryption: BlockEncryptor = async (plaintext, vaultKey, kid) => {
    session = null;
    return encryptBlock(plaintext, vaultKey, kid);
  };

  const encrypted = await encryptPlaintextBlocksAtomically(store, () => session, lockDuringEncryption);

  assert.equal(encrypted, 0);
  assert.equal(store.processCalls, 0);
  assert.equal(store.value, original);
});

test("does not write when the session locks immediately before the atomic commit", async () => {
  let session: SessionKeys | null = await createSession();
  const original = "before\n```lockblock\nsynthetic secret\n```\nafter";
  const store = new MemoryAtomicTextStore(original);
  store.beforeProcess = () => {
    session = null;
  };

  const encrypted = await encryptPlaintextBlocksAtomically(store, () => session);

  assert.equal(encrypted, 0);
  assert.equal(store.processCalls, 1);
  assert.equal(store.value, original);
});

test("leaves empty and malformed lockblock records unchanged without processing", async () => {
  const session = await createSession();
  const original = [
    "before",
    "```lockblock",
    "",
    "```",
    "```lockblock",
    "lockblock:v1:kid=malformed",
    "```",
    "after",
  ].join("\n");
  const store = new MemoryAtomicTextStore(original);

  const encrypted = await encryptPlaintextBlocksAtomically(store, () => session);

  assert.equal(encrypted, 0);
  assert.equal(store.processCalls, 0);
  assert.equal(store.value, original);
});

test("preserves all concurrent edits when retry attempts are exhausted", async () => {
  const session = await createSession();
  const store = new MemoryAtomicTextStore("```lockblock\nsynthetic secret\n```");
  store.beforeProcess = (currentStore) => {
    currentStore.value = `${currentStore.value}\nconcurrent-${currentStore.processCalls}`;
  };

  await assert.rejects(
    encryptPlaintextBlocksAtomically(store, () => session),
    /note kept changing/i,
  );
  assert.equal(store.readCalls, 3);
  assert.equal(store.processCalls, 3);
  assert.match(store.value, /concurrent-1\nconcurrent-2\nconcurrent-3$/);
  assert.match(store.value, /synthetic secret/);
});

test("encryption failure leaves the source untouched and skips processing", async () => {
  const session = await createSession();
  const original = "```lockblock\nsynthetic secret\n```";
  const store = new MemoryAtomicTextStore(original);
  const failEncryption: BlockEncryptor = async () => {
    throw new Error("synthetic encryption failure");
  };

  await assert.rejects(
    encryptPlaintextBlocksAtomically(store, () => session, failEncryption),
    /synthetic encryption failure/,
  );
  assert.equal(store.processCalls, 0);
  assert.equal(store.value, original);
});
