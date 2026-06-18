import { base64UrlToBytes, bytesToBase64Url, bytesToText, textToBytes } from "./base64";
import type { SealedBlockHeader, WrappedKeyRecord } from "./types";

const AES_GCM_IV_BYTES = 12;
const VAULT_KEY_BYTES = 32;
const SALT_BYTES = 16;

export function randomKid(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  bytes[6] = (bytes[6] & 0x0f) | 0x40;
  bytes[8] = (bytes[8] & 0x3f) | 0x80;

  return [
    bytesToHex(bytes.slice(0, 4)),
    bytesToHex(bytes.slice(4, 6)),
    bytesToHex(bytes.slice(6, 8)),
    bytesToHex(bytes.slice(8, 10)),
    bytesToHex(bytes.slice(10, 16)),
  ].join("-");
}

export function generateRecoveryKey(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(VAULT_KEY_BYTES));
  return `lbk_${bytesToBase64Url(bytes)}`;
}

export async function generateVaultKey(): Promise<CryptoKey> {
  return crypto.subtle.generateKey({ name: "AES-GCM", length: 256 }, true, ["encrypt", "decrypt"]);
}

export async function encryptBlock(plaintext: string, vaultKey: CryptoKey, kid: string): Promise<SealedBlockHeader> {
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const ciphertext = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toBufferSource(iv) }, vaultKey, toBufferSource(textToBytes(plaintext)));

  return {
    kid,
    alg: "AES-GCM",
    iv: bytesToBase64Url(iv),
    ct: bytesToBase64Url(new Uint8Array(ciphertext)),
  };
}

export async function decryptBlock(header: SealedBlockHeader, vaultKey: CryptoKey): Promise<string> {
  const plaintext = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBufferSource(base64UrlToBytes(header.iv)) },
    vaultKey,
    toBufferSource(base64UrlToBytes(header.ct)),
  );

  return bytesToText(new Uint8Array(plaintext));
}

export async function wrapVaultKey(
  kid: string,
  vaultKey: CryptoKey,
  secret: string,
  iterations: number,
): Promise<WrappedKeyRecord> {
  const salt = crypto.getRandomValues(new Uint8Array(SALT_BYTES));
  const iv = crypto.getRandomValues(new Uint8Array(AES_GCM_IV_BYTES));
  const wrappingKey = await deriveWrappingKey(secret, salt, iterations);
  const rawVaultKey = await crypto.subtle.exportKey("raw", vaultKey);
  const wrapped = await crypto.subtle.encrypt({ name: "AES-GCM", iv: toBufferSource(iv) }, wrappingKey, rawVaultKey);

  return {
    kid,
    iterations,
    salt: bytesToBase64Url(salt),
    iv: bytesToBase64Url(iv),
    wrappedKey: bytesToBase64Url(new Uint8Array(wrapped)),
  };
}

export async function unwrapVaultKey(record: WrappedKeyRecord, secret: string): Promise<CryptoKey> {
  const wrappingKey = await deriveWrappingKey(secret, base64UrlToBytes(record.salt), record.iterations);
  const rawVaultKey = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: toBufferSource(base64UrlToBytes(record.iv)) },
    wrappingKey,
    toBufferSource(base64UrlToBytes(record.wrappedKey)),
  );

  return crypto.subtle.importKey("raw", rawVaultKey, { name: "AES-GCM" }, true, ["encrypt", "decrypt"]);
}

async function deriveWrappingKey(secret: string, salt: Uint8Array, iterations: number): Promise<CryptoKey> {
  const passwordKey = await crypto.subtle.importKey("raw", toBufferSource(textToBytes(secret)), "PBKDF2", false, ["deriveKey"]);

  return crypto.subtle.deriveKey(
    {
      name: "PBKDF2",
      salt: toBufferSource(salt),
      iterations,
      hash: "SHA-256",
    },
    passwordKey,
    { name: "AES-GCM", length: 256 },
    false,
    ["encrypt", "decrypt"],
  );
}

function toBufferSource(bytes: Uint8Array): ArrayBuffer {
  return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
}

function bytesToHex(bytes: Uint8Array): string {
  return Array.from(bytes, (byte) => byte.toString(16).padStart(2, "0")).join("");
}
