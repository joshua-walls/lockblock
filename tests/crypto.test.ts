import assert from "node:assert/strict";
import test from "node:test";
import { base64UrlToBytes, bytesToBase64Url } from "../src/base64";
import {
  decryptBlock,
  encryptBlock,
  generateRecoveryKey,
  generateVaultKey,
  randomKid,
  unwrapVaultKey,
  wrapVaultKey,
} from "../src/crypto";

const TEST_KID = "00000000-0000-4000-8000-000000000001";
const TEST_PASSWORD = "synthetic-password-one";
const TEST_PLAINTEXT = "Synthetic Lockblock plaintext\nwith Unicode: café 🔒";
const TEST_ITERATIONS = 1_000;

test("AES-GCM encrypts and decrypts synthetic plaintext", async () => {
  const vaultKey = await generateVaultKey();
  const header = await encryptBlock(TEST_PLAINTEXT, vaultKey, TEST_KID);

  assert.equal(header.kid, TEST_KID);
  assert.equal(header.alg, "AES-GCM");
  assert.equal(base64UrlToBytes(header.iv).byteLength, 12);
  assert.equal(await decryptBlock(header, vaultKey), TEST_PLAINTEXT);
});

test("AES-GCM uses a fresh 12-byte IV for every encryption", async () => {
  const vaultKey = await generateVaultKey();
  const first = await encryptBlock(TEST_PLAINTEXT, vaultKey, TEST_KID);
  const second = await encryptBlock(TEST_PLAINTEXT, vaultKey, TEST_KID);

  assert.equal(base64UrlToBytes(first.iv).byteLength, 12);
  assert.equal(base64UrlToBytes(second.iv).byteLength, 12);
  assert.notEqual(first.iv, second.iv);
  assert.notEqual(first.ct, second.ct);
});

test("AES-GCM rejects modified ciphertext and the wrong vault key", async () => {
  const vaultKey = await generateVaultKey();
  const wrongKey = await generateVaultKey();
  const header = await encryptBlock(TEST_PLAINTEXT, vaultKey, TEST_KID);
  const modifiedCiphertext = base64UrlToBytes(header.ct);
  modifiedCiphertext[0] ^= 1;

  await assert.rejects(
    decryptBlock({ ...header, ct: bytesToBase64Url(modifiedCiphertext) }, vaultKey),
  );
  await assert.rejects(decryptBlock(header, wrongKey));
});

test("password wrapping preserves the vault key and rejects a wrong password", async () => {
  const vaultKey = await generateVaultKey();
  const wrapped = await wrapVaultKey(TEST_KID, vaultKey, TEST_PASSWORD, TEST_ITERATIONS);

  assert.equal(wrapped.kid, TEST_KID);
  assert.equal(wrapped.iterations, TEST_ITERATIONS);
  assert.equal(base64UrlToBytes(wrapped.salt).byteLength, 16);
  assert.equal(base64UrlToBytes(wrapped.iv).byteLength, 12);

  const unwrappedKey = await unwrapVaultKey(wrapped, TEST_PASSWORD);
  const header = await encryptBlock(TEST_PLAINTEXT, unwrappedKey, TEST_KID);
  assert.equal(await decryptBlock(header, vaultKey), TEST_PLAINTEXT);
  await assert.rejects(unwrapVaultKey(wrapped, "synthetic-wrong-password"));
});

test("version-1 unwrapping matches the PBKDF2 SHA-256 known-answer fixture", async () => {
  const unwrappedKey = await unwrapVaultKey(
    {
      kid: TEST_KID,
      iterations: TEST_ITERATIONS,
      salt: "ICEiIyQlJicoKSorLC0uLw",
      iv: "QEFCQ0RFRkdISUpL",
      wrappedKey: "Afo7LVRvuarAp_6tTIIcQ97jyM-aneVOO89nG2UsB2d_cOAvQwmjVjvHhEALzdnU",
    },
    "synthetic-known-answer-password",
  );
  const rawKey = new Uint8Array(await crypto.subtle.exportKey("raw", unwrappedKey));

  assert.equal(bytesToBase64Url(rawKey), "AAECAwQFBgcICQoLDA0ODxAREhMUFRYXGBkaGxwdHh8");
});

test("generated IDs and recovery keys retain their public formats", () => {
  assert.match(randomKid(), /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);

  const recoveryKey = generateRecoveryKey();
  assert.match(recoveryKey, /^lbk_[A-Za-z0-9_-]+$/);
  assert.equal(base64UrlToBytes(recoveryKey.slice(4)).byteLength, 32);
});
