import { SECRET_STORAGE_ID } from "./constants";
import { generateRecoveryKey, generateVaultKey, randomKid, unwrapVaultKey, wrapVaultKey } from "./crypto";
import type { Keyring, SessionKeys } from "./types";

interface SecretStorageLike {
  getSecret(id: string): string | null;
  setSecret(id: string, secret: string): void;
}

export class LockblockKeyring {
  private readonly storage: SecretStorageLike;
  session: SessionKeys | null = null;

  constructor(storage: SecretStorageLike) {
    this.storage = storage;
  }

  hasKeyring(): boolean {
    return this.load() !== null;
  }

  load(): Keyring | null {
    const raw = this.storage.getSecret(SECRET_STORAGE_ID);
    if (!raw) {
      return null;
    }

    try {
      const parsed: unknown = JSON.parse(raw);
      return LockblockKeyring.isKeyring(parsed) ? parsed : null;
    } catch {
      return null;
    }
  }

  getKeyring(): Keyring | null {
    return this.load();
  }

  importKeyring(keyring: Keyring): void {
    this.save(keyring);
  }

  static isKeyring(value: unknown): value is Keyring {
    if (!isRecord(value)) {
      return false;
    }

    return value.version === 1
      && typeof value.activeKid === "string"
      && isWrappedKeyRecord(value.passwordWrapped)
      && isWrappedKeyRecord(value.recoveryWrapped)
      && typeof value.createdAt === "string"
      && typeof value.updatedAt === "string";
  }

  setup(password: string, iterations: number): Promise<{ keyring: Keyring; recoveryKey: string }> {
    return this.createInitialKeyring(password, iterations);
  }

  async unlock(password: string): Promise<void> {
    const keyring = this.requireKeyring();
    const vaultKey = await unwrapVaultKey(keyring.passwordWrapped, password);
    this.session = { kid: keyring.activeKid, vaultKey };
  }

  async restore(recoveryKey: string, newPassword: string, iterations: number): Promise<void> {
    const keyring = this.requireKeyring();
    const vaultKey = await unwrapVaultKey(keyring.recoveryWrapped, recoveryKey);
    const now = new Date().toISOString();
    const next: Keyring = {
      ...keyring,
      passwordWrapped: await wrapVaultKey(keyring.activeKid, vaultKey, newPassword, iterations),
      updatedAt: now,
    };

    this.save(next);
    this.session = { kid: keyring.activeKid, vaultKey };
  }

  async changePassword(currentPassword: string, nextPassword: string, iterations: number): Promise<void> {
    const keyring = this.requireKeyring();
    const vaultKey = await unwrapVaultKey(keyring.passwordWrapped, currentPassword);
    const next: Keyring = {
      ...keyring,
      passwordWrapped: await wrapVaultKey(keyring.activeKid, vaultKey, nextPassword, iterations),
      updatedAt: new Date().toISOString(),
    };

    this.save(next);
    this.session = { kid: keyring.activeKid, vaultKey };
  }

  async showRecoveryKey(password: string, iterations: number): Promise<string> {
    const keyring = this.requireKeyring();
    const vaultKey = await unwrapVaultKey(keyring.passwordWrapped, password);
    const recoveryKey = generateRecoveryKey();
    const next: Keyring = {
      ...keyring,
      recoveryWrapped: await wrapVaultKey(keyring.activeKid, vaultKey, recoveryKey, iterations),
      updatedAt: new Date().toISOString(),
    };

    this.save(next);
    return recoveryKey;
  }

  lock(): void {
    this.session = null;
  }

  private async createInitialKeyring(password: string, iterations: number): Promise<{ keyring: Keyring; recoveryKey: string }> {
    const kid = randomKid();
    const vaultKey = await generateVaultKey();
    const recoveryKey = generateRecoveryKey();
    const now = new Date().toISOString();
    const keyring: Keyring = {
      version: 1,
      activeKid: kid,
      passwordWrapped: await wrapVaultKey(kid, vaultKey, password, iterations),
      recoveryWrapped: await wrapVaultKey(kid, vaultKey, recoveryKey, iterations),
      createdAt: now,
      updatedAt: now,
    };

    this.save(keyring);
    this.session = { kid, vaultKey };
    return { keyring, recoveryKey };
  }

  private save(keyring: Keyring): void {
    this.storage.setSecret(SECRET_STORAGE_ID, JSON.stringify(keyring));
  }

  private requireKeyring(): Keyring {
    const keyring = this.load();
    if (!keyring) {
      throw new Error("Lockblock has not been set up.");
    }

    return keyring;
  }
}

function isWrappedKeyRecord(value: unknown): boolean {
  if (!isRecord(value)) {
    return false;
  }

  return typeof value.kid === "string"
    && typeof value.iterations === "number"
    && typeof value.salt === "string"
    && typeof value.iv === "string"
    && typeof value.wrappedKey === "string";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}
