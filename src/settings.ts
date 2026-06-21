import { DEFAULT_AUTO_HIDE_SECONDS, DEFAULT_BACKGROUND_LOCK_MINUTES, DEFAULT_KDF_ITERATIONS, DEFAULT_SESSION_LOCK_MINUTES } from "./constants";
import { LockblockKeyring } from "./keyring";
import type { LockblockSettings } from "./types";

export const DEFAULT_SETTINGS: LockblockSettings = {
  syncedKeyring: null,
  autoEncryptOnReadingView: true,
  autoHideRevealedSeconds: DEFAULT_AUTO_HIDE_SECONDS,
  copyWithoutReveal: true,
  confirmDecryptToRaw: true,
  lockOnBackgroundMinutes: DEFAULT_BACKGROUND_LOCK_MINUTES,
  sessionLockMinutes: DEFAULT_SESSION_LOCK_MINUTES,
  kdfIterations: DEFAULT_KDF_ITERATIONS,
};

export function normalizeSettings(data: Partial<LockblockSettings> | null | undefined): LockblockSettings {
  return {
    syncedKeyring: LockblockKeyring.isKeyring(data?.syncedKeyring) ? data.syncedKeyring : DEFAULT_SETTINGS.syncedKeyring,
    autoEncryptOnReadingView: data?.autoEncryptOnReadingView ?? DEFAULT_SETTINGS.autoEncryptOnReadingView,
    autoHideRevealedSeconds: numberOrDefault(data?.autoHideRevealedSeconds, DEFAULT_SETTINGS.autoHideRevealedSeconds, 0, 86_400),
    copyWithoutReveal: data?.copyWithoutReveal ?? DEFAULT_SETTINGS.copyWithoutReveal,
    confirmDecryptToRaw: data?.confirmDecryptToRaw ?? DEFAULT_SETTINGS.confirmDecryptToRaw,
    lockOnBackgroundMinutes: numberOrDefault(data?.lockOnBackgroundMinutes, DEFAULT_SETTINGS.lockOnBackgroundMinutes, 0, 1_440),
    sessionLockMinutes: numberOrDefault(data?.sessionLockMinutes, DEFAULT_SETTINGS.sessionLockMinutes, 0, 1_440),
    kdfIterations: numberOrDefault(data?.kdfIterations, DEFAULT_SETTINGS.kdfIterations, 100_000, 2_000_000),
  };
}

function numberOrDefault(value: unknown, fallback: number, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }

  return Math.min(max, Math.max(min, Math.round(value)));
}
