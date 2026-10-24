import assert from "node:assert/strict";
import test from "node:test";
import { DEFAULT_SETTINGS, normalizeSettings } from "../src/settings";
import type { Keyring } from "../src/types";

const VALID_KEYRING: Keyring = {
  version: 1,
  activeKid: "00000000-0000-4000-8000-000000000001",
  passwordWrapped: {
    kid: "00000000-0000-4000-8000-000000000001",
    iterations: 600_000,
    salt: "synthetic-salt",
    iv: "synthetic-iv",
    wrappedKey: "synthetic-password-wrapped-key",
  },
  recoveryWrapped: {
    kid: "00000000-0000-4000-8000-000000000001",
    iterations: 600_000,
    salt: "synthetic-recovery-salt",
    iv: "synthetic-recovery-iv",
    wrappedKey: "synthetic-recovery-wrapped-key",
  },
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-01T00:00:00.000Z",
};

test("missing settings normalize to independent defaults", () => {
  const first = normalizeSettings(null);
  const second = normalizeSettings(undefined);

  assert.deepEqual(first, DEFAULT_SETTINGS);
  assert.deepEqual(second, DEFAULT_SETTINGS);
  assert.notEqual(first, DEFAULT_SETTINGS);
  assert.notEqual(first, second);
});

test("explicit boolean settings, including false, are preserved", () => {
  const normalized = normalizeSettings({
    autoEncryptOnReadingView: false,
    copyWithoutReveal: false,
    confirmDecryptToRaw: false,
    suppressNotifications: true,
  });

  assert.equal(normalized.autoEncryptOnReadingView, false);
  assert.equal(normalized.copyWithoutReveal, false);
  assert.equal(normalized.confirmDecryptToRaw, false);
  assert.equal(normalized.suppressNotifications, true);
});

test("numeric settings round, clamp, and reject non-finite values", () => {
  const normalized = normalizeSettings({
    autoHideRevealedSeconds: 90.6,
    lockOnBackgroundMinutes: -10,
    sessionLockMinutes: 2_000,
    kdfIterations: Number.POSITIVE_INFINITY,
  });

  assert.equal(normalized.autoHideRevealedSeconds, 91);
  assert.equal(normalized.lockOnBackgroundMinutes, 0);
  assert.equal(normalized.sessionLockMinutes, 1_440);
  assert.equal(normalized.kdfIterations, DEFAULT_SETTINGS.kdfIterations);

  const kdfBounds = normalizeSettings({ kdfIterations: 50_000 });
  assert.equal(kdfBounds.kdfIterations, 100_000);
  assert.equal(normalizeSettings({ kdfIterations: 3_000_000 }).kdfIterations, 2_000_000);
});

test("only structurally valid version-1 synced keyrings are retained", () => {
  assert.equal(normalizeSettings({ syncedKeyring: VALID_KEYRING }).syncedKeyring, VALID_KEYRING);

  const malformed = { ...VALID_KEYRING, version: 2 };
  const normalized = normalizeSettings({ syncedKeyring: malformed as unknown as Keyring });
  assert.equal(normalized.syncedKeyring, null);
});
