import assert from "node:assert/strict";
import test from "node:test";
import { decryptBlock, encryptBlock } from "../src/crypto";
import { LockblockKeyring } from "../src/keyring";
import type { SessionKeys } from "../src/types";

const TEST_ITERATIONS = 1_000;
const ORIGINAL_PASSWORD = "synthetic-original-password";
const NEXT_PASSWORD = "synthetic-next-password";
const TEST_PLAINTEXT = "Synthetic keyring compatibility text";

class MemorySecretStorage {
  private readonly values = new Map<string, string>();

  getSecret(id: string): string | null {
    return this.values.get(id) ?? null;
  }

  setSecret(id: string, value: string): void {
    this.values.set(id, value);
  }
}

test("setup creates a valid version-1 keyring that unlocks after locking", async () => {
  const keyring = new LockblockKeyring(new MemorySecretStorage());
  const result = await keyring.setup(ORIGINAL_PASSWORD, TEST_ITERATIONS);

  assert.equal(LockblockKeyring.isKeyring(result.keyring), true);
  assert.equal(result.keyring.version, 1);
  assert.equal(result.keyring.activeKid, keyring.session?.kid);
  assert.match(result.recoveryKey, /^lbk_/);

  keyring.lock();
  await assert.rejects(keyring.unlock("synthetic-wrong-password"));
  assert.equal(keyring.session, null);
  await keyring.unlock(ORIGINAL_PASSWORD);
  const unlockedSession = requireSession(keyring);
  assert.equal(unlockedSession.kid, result.keyring.activeKid);
});

test("changing the password preserves access to existing encrypted blocks", async () => {
  const keyring = new LockblockKeyring(new MemorySecretStorage());
  await keyring.setup(ORIGINAL_PASSWORD, TEST_ITERATIONS);
  assert.ok(keyring.session);
  const header = await encryptBlock(TEST_PLAINTEXT, keyring.session.vaultKey, keyring.session.kid);

  await keyring.changePassword(ORIGINAL_PASSWORD, NEXT_PASSWORD, TEST_ITERATIONS);
  keyring.lock();
  await assert.rejects(keyring.unlock(ORIGINAL_PASSWORD));
  await keyring.unlock(NEXT_PASSWORD);
  assert.ok(keyring.session);
  assert.equal(await decryptBlock(header, keyring.session.vaultKey), TEST_PLAINTEXT);
});

test("recovery restores the same vault key under a new password", async () => {
  const keyring = new LockblockKeyring(new MemorySecretStorage());
  const { recoveryKey } = await keyring.setup(ORIGINAL_PASSWORD, TEST_ITERATIONS);
  assert.ok(keyring.session);
  const header = await encryptBlock(TEST_PLAINTEXT, keyring.session.vaultKey, keyring.session.kid);

  keyring.lock();
  await keyring.restore(recoveryKey, NEXT_PASSWORD, TEST_ITERATIONS);
  keyring.lock();
  await assert.rejects(keyring.unlock(ORIGINAL_PASSWORD));
  await keyring.unlock(NEXT_PASSWORD);
  assert.ok(keyring.session);
  assert.equal(await decryptBlock(header, keyring.session.vaultKey), TEST_PLAINTEXT);
});

test("showing a new recovery key invalidates the previous recovery key", async () => {
  const keyring = new LockblockKeyring(new MemorySecretStorage());
  const { recoveryKey: previousRecoveryKey } = await keyring.setup(ORIGINAL_PASSWORD, TEST_ITERATIONS);
  const nextRecoveryKey = await keyring.showRecoveryKey(ORIGINAL_PASSWORD, TEST_ITERATIONS);

  assert.notEqual(nextRecoveryKey, previousRecoveryKey);
  keyring.lock();
  await assert.rejects(keyring.restore(previousRecoveryKey, NEXT_PASSWORD, TEST_ITERATIONS));
  await keyring.restore(nextRecoveryKey, NEXT_PASSWORD, TEST_ITERATIONS);
  assert.ok(keyring.session);
});

test("keyring validation and loading reject malformed records", async () => {
  const storage = new MemorySecretStorage();
  const keyring = new LockblockKeyring(storage);
  const { keyring: valid } = await keyring.setup(ORIGINAL_PASSWORD, TEST_ITERATIONS);

  assert.equal(LockblockKeyring.isKeyring(valid), true);
  assert.equal(LockblockKeyring.isKeyring({ ...valid, version: 2 }), false);
  assert.equal(LockblockKeyring.isKeyring({ ...valid, activeKid: 7 }), false);
  assert.equal(LockblockKeyring.isKeyring({ ...valid, passwordWrapped: null }), false);

  storage.setSecret("lockblock-keyring", "not-json");
  assert.equal(keyring.load(), null);
});

function requireSession(keyring: LockblockKeyring): SessionKeys {
  const session = keyring.session;
  assert.ok(session);
  return session;
}
