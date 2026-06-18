export interface LockblockSettings {
  autoEncryptPlaintextBlocks: boolean;
  autoEncryptOnReadingView: boolean;
  autoHideRevealedSeconds: number;
  copyWithoutReveal: boolean;
  confirmDecryptToRaw: boolean;
  lockOnBackgroundMinutes: number;
  sessionLockMinutes: number;
  kdfIterations: number;
}

export interface WrappedKeyRecord {
  kid: string;
  iterations: number;
  salt: string;
  iv: string;
  wrappedKey: string;
}

export interface Keyring {
  version: 1;
  activeKid: string;
  passwordWrapped: WrappedKeyRecord;
  recoveryWrapped: WrappedKeyRecord;
  createdAt: string;
  updatedAt: string;
}

export interface SealedBlockHeader {
  kid: string;
  alg: "AES-GCM";
  iv: string;
  ct: string;
}

export interface EncryptedBlock {
  from: number;
  to: number;
  openFence: string;
  closeFence: string;
  body: string;
  sealed: boolean;
  header: SealedBlockHeader | null;
}

export interface SessionKeys {
  kid: string;
  vaultKey: CryptoKey;
}
