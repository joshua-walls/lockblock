import {
  Editor,
  MarkdownView,
  MarkdownPostProcessorContext,
  Menu,
  Notice,
  Plugin,
  setIcon,
  TFile,
} from "obsidian";
import { LOCKBLOCK_BLOCK_LANGUAGE } from "./constants";
import { findEncryptedBlocks, formatPlaintextBlock, formatSealedBlock, parseSealedHeader, selectedBlock, serializeSealedHeader } from "./blocks";
import { decryptBlock, encryptBlock } from "./crypto";
import { LockblockKeyring } from "./keyring";
import { normalizeSettings } from "./settings";
import type { EncryptedBlock, LockblockSettings, SealedBlockHeader } from "./types";
import { LockblockSettingTab, askForPassword, confirmAction, showPlaintext, showRecoveryKey } from "./ui";

type RevealedEntry = {
  plaintext: string;
  timeout: number | null;
};

type StatusBarState = VaultLockState | "locking";

export type VaultLockState = "locked" | "unlocked" | "not-setup";
export type LockStateChangeCallback = (state: VaultLockState) => void;

export default class LockblockPlugin extends Plugin {
  settings: LockblockSettings;
  private keyring: LockblockKeyring;
  private revealed = new Map<string, RevealedEntry>();
  private renderCallbacks = new Set<() => void>();
  private lockStateCallbacks = new Set<LockStateChangeCallback>();
  private backgroundLockTimer: number | null = null;
  private sessionLockTimer: number | null = null;
  private markdownRefreshTimer: number | null = null;
  private statusBarItem: HTMLElement | null = null;
  private statusBarLabel: HTMLElement | null = null;
  private statusBarIcon: HTMLElement | null = null;
  private statusBarTimer: number | null = null;
  private renderedFileEncrypting = new Set<string>();
  private modeWatchInFlight = false;
  private lastActiveModeKey: string | null = null;
  private encrypting = false;
  private lastLockedEditNoticeAt = 0;

  async onload(): Promise<void> {
    const loadedData: unknown = await this.loadData();
    this.settings = normalizeSettings(isSettingsObject(loadedData) ? loadedData : null);
    this.keyring = new LockblockKeyring(this.app.secretStorage);
    await this.syncKeyringState();
    this.notifyLockStateChanged("not-setup");

    this.addSettingTab(new LockblockSettingTab(this.app, this));
    this.registerMarkdownPostProcessor((el, ctx) => this.renderReadingLockblockBlocks(el, ctx));
    await this.registerEditProtection();
    this.registerCommands();
    this.registerContextMenus();
    this.registerStatusBar();
    this.registerMarkdownRefresh();
    this.registerViewAutomation();
    this.registerBackgroundLock();
    this.scheduleMarkdownRefresh();
  }

  onunload(): void {
    this.clearTimers();
    this.forgetSessionKeys();
  }

  async saveSettings(): Promise<void> {
    this.settings = normalizeSettings(this.settings);
    await this.saveData(this.settings);
    this.scheduleSessionLock();
  }

  async runSyncKeyringToSettings(): Promise<void> {
    if (await this.syncKeyringToSettings()) {
      new Notice("Lockblock keyring synced to plugin settings.");
    } else {
      new Notice("Set up lockblock before syncing the keyring.");
    }
  }

  async runImportSyncedKeyring(): Promise<void> {
    const synced = this.settings.syncedKeyring;
    if (!synced) {
      new Notice("No synced lockblock keyring found in plugin settings.");
      return;
    }

    const local = this.keyring.getKeyring();
    if (local) {
      const confirmed = await confirmAction(
        this.app,
        "Import synced keyring?",
        "This replaces the local Lockblock keyring on this device with the synced wrapped keyring from plugin settings.",
        "Import keyring",
      );
      if (!confirmed) {
        return;
      }
    }

    const previousState = this.getVaultLockState();
    this.keyring.importKeyring(synced);
    this.forgetSessionKeys(previousState);
    new Notice("Synced lockblock keyring imported on this device.");
  }

  isVaultUnlocked(): boolean {
    return this.isUnlocked();
  }

  isUnlocked(): boolean {
    return this.keyring.session !== null;
  }

  getVaultLockState(): VaultLockState {
    if (!this.keyring.hasKeyring()) {
      return "not-setup";
    }

    return this.isUnlocked() ? "unlocked" : "locked";
  }

  onLockStateChange(callback: LockStateChangeCallback): () => void {
    this.lockStateCallbacks.add(callback);
    return () => {
      this.lockStateCallbacks.delete(callback);
    };
  }

  notifyLockedEditBlocked(): void {
    this.showUnlockNotice("Unlock lockblock before editing this encrypted block.");
  }

  private notifyLockedEditMode(): void {
    this.showUnlockNotice("Unlock lockblock to edit encrypted blocks.");
  }

  private showUnlockNotice(message: string): void {
    const now = Date.now();
    if (now - this.lastLockedEditNoticeAt < 1500) {
      return;
    }

    this.lastLockedEditNoticeAt = now;
    const fragment = activeDocument.createDocumentFragment();
    const text = activeDocument.createElement("span");
    text.textContent = message;
    fragment.append(text);

    const button = activeDocument.createElement("button");
    button.type = "button";
    button.textContent = "Unlock";
    button.addClass("lockblock-notice-button");
    fragment.append(button);

    const notice = new Notice(fragment, 8000);
    button.addEventListener("click", () => {
      notice.hide();
      void this.runUnlock();
    });
  }

  private async registerEditProtection(): Promise<void> {
    try {
      const { createLockblockEditProtection } = await import("./editor-protection");
      this.registerEditorExtension(createLockblockEditProtection(this));
      this.app.workspace.updateOptions();
    } catch (error) {
      console.error("Lockblock edit protection could not be enabled.", error);
      new Notice("Lockblock loaded, but edit protection could not be enabled.");
    }
  }

  private async syncKeyringState(): Promise<void> {
    const local = this.keyring.getKeyring();
    const synced = this.settings.syncedKeyring;

    if (synced && !local) {
      this.keyring.importKeyring(synced);
    }
  }

  private async syncKeyringToSettings(): Promise<boolean> {
    const keyring = this.keyring.getKeyring();
    if (!keyring) {
      return false;
    }

    this.settings.syncedKeyring = keyring;
    await this.saveSettings();
    return true;
  }

  private registerCommands(): void {
    this.addCommand({
      id: "setup",
      name: "Setup",
      callback: () => this.runSetup(),
    });

    this.addCommand({
      id: "unlock",
      name: "Unlock",
      checkCallback: (checking) => {
        const canUnlock = this.getVaultLockState() === "locked";
        if (canUnlock && !checking) {
          void this.runUnlock();
        }

        return canUnlock;
      },
    });

    this.addCommand({
      id: "lock",
      name: "Lock",
      checkCallback: (checking) => {
        const canLock = this.isUnlocked();
        if (canLock && !checking) {
          void this.runLock();
        }

        return canLock;
      },
    });

    this.addCommand({
      id: "encrypt-plaintext-blocks-current-note",
      name: "Encrypt plaintext blocks in current note",
      editorCallback: (editor) => this.encryptPlaintextBlocksInEditor(editor, true),
    });

    this.addCommand({
      id: "reveal-selected-block",
      name: "Reveal selected block",
      editorCallback: (editor) => this.revealSelectedBlock(editor),
    });

    this.addCommand({
      id: "copy-selected-block",
      name: "Copy selected block",
      editorCallback: (editor) => this.copySelectedBlock(editor),
    });

    this.addCommand({
      id: "hide-revealed-blocks",
      name: "Hide revealed blocks",
      callback: () => this.runHideRevealedBlocks(),
    });

    this.addCommand({
      id: "decrypt-selected-block-to-raw",
      name: "Decrypt selected block to raw plaintext",
      editorCallback: (editor) => this.decryptSelectedBlockToRaw(editor),
    });

    this.addCommand({
      id: "change-unlock-password",
      name: "Change unlock password",
      callback: () => this.runChangePassword(),
    });

    this.addCommand({
      id: "show-recovery-key",
      name: "Show recovery key",
      callback: () => this.runShowRecovery(),
    });

    this.addCommand({
      id: "restore-from-recovery-key",
      name: "Restore from recovery key",
      callback: () => this.runRestoreFromRecovery(),
    });

    this.addCommand({
      id: "sync-keyring-to-plugin-settings",
      name: "Sync keyring to plugin settings",
      callback: () => this.runSyncKeyringToSettings(),
    });

    this.addCommand({
      id: "import-synced-keyring",
      name: "Import synced keyring",
      callback: () => this.runImportSyncedKeyring(),
    });

    this.addCommand({
      id: "rotate-vault-key",
      name: "Rotate vault key",
      callback: () => this.runRotateVaultKey(),
    });

    this.addCommand({
      id: "forget-session-keys",
      name: "Forget session keys",
      callback: () => void this.runForgetSessionKeys(),
    });
  }

  private registerContextMenus(): void {
    this.registerEvent(
      this.app.workspace.on("editor-menu", (menu, editor) => {
        this.addEditorContextMenuItems(menu, editor);
      }),
    );
  }

  private addEditorContextMenuItems(menu: Menu, editor: Editor): void {
    const block = this.currentEncryptedBlock(editor, editor.getValue());
    if (!block) {
      return;
    }

    menu.addSeparator();
    if (block.header) {
      const unlocked = this.isUnlocked();
      menu.addItem((item) => {
        item
          .setTitle(unlocked ? "Reveal lockblock" : "Unlock and reveal lockblock")
          .setIcon(unlocked ? "eye" : "unlock")
          .onClick(() => void this.revealSelectedBlock(editor));
      });
      menu.addItem((item) => {
        item
          .setTitle(unlocked ? "Copy lockblock plaintext" : "Unlock and copy lockblock plaintext")
          .setIcon("copy")
          .onClick(() => void this.copySelectedBlock(editor));
      });
      menu.addItem((item) => {
        item
          .setTitle(unlocked ? "Decrypt lockblock to raw plaintext" : "Unlock and decrypt lockblock to raw plaintext")
          .setIcon("file-text")
          .onClick(() => void this.decryptSelectedBlockToRaw(editor));
      });
      return;
    }

    menu.addItem((item) => {
      item
        .setTitle(this.isUnlocked() ? "Encrypt lockblock" : "Unlock and encrypt lockblock")
        .setIcon("lock")
        .onClick(() => void this.encryptSelectedPlaintextBlock(editor, true));
    });
  }

  async runSetup(): Promise<void> {
    if (this.keyring.hasKeyring()) {
      new Notice("Lockblock is already set up.");
      return;
    }

    const result = await askForPassword(this.app, "setup");
    if (!result?.password) {
      return;
    }

    try {
      const previousState = this.getVaultLockState();
      const { recoveryKey } = await this.keyring.setup(result.password, this.settings.kdfIterations);
      await this.syncKeyringToSettings();
      this.scheduleSessionLock();
      this.notifyLockStateChanged(previousState);
      await showRecoveryKey(this.app, recoveryKey);
      new Notice("Lockblock is set up and unlocked.");
    } catch (error) {
      new Notice(`Setup failed: ${messageFromError(error)}`);
    }
  }

  async runUnlock(): Promise<boolean> {
    await this.syncKeyringState();

    if (!this.keyring.hasKeyring()) {
      new Notice("Run lockblock: Setup first.");
      return false;
    }

    const result = await askForPassword(this.app, "unlock");
    if (!result?.password) {
      return false;
    }

    try {
      const previousState = this.getVaultLockState();
      await this.keyring.unlock(result.password);
      this.scheduleSessionLock();
      await this.decryptActiveEditorForEditing();
      this.refreshRenderedCards();
      this.notifyLockStateChanged(previousState);
      new Notice("Lockblock unlocked.");
      return true;
    } catch {
      new Notice("Unlock failed. Check the password and try again.");
      return false;
    }
  }

  async runLock(): Promise<void> {
    await this.encryptActiveEditorBeforeLock();
    this.forgetSessionKeys();
    new Notice("Lockblock locked.");
  }

  async runForgetSessionKeys(): Promise<void> {
    await this.encryptActiveEditorBeforeLock();
    this.forgetSessionKeys();
    new Notice("Session keys forgotten.");
  }

  async runEncryptPlaintextBlocksInCurrentNote(): Promise<void> {
    const editor = this.activeMarkdownEditor();
    if (!editor) {
      new Notice("Open a Markdown note first.");
      return;
    }

    await this.encryptPlaintextBlocksInEditor(editor, true);
  }

  async runRevealSelectedBlock(): Promise<void> {
    const editor = this.activeMarkdownEditor();
    if (!editor) {
      new Notice("Open a Markdown note first.");
      return;
    }

    await this.revealSelectedBlock(editor);
  }

  async runCopySelectedBlock(): Promise<void> {
    const editor = this.activeMarkdownEditor();
    if (!editor) {
      new Notice("Open a Markdown note first.");
      return;
    }

    await this.copySelectedBlock(editor);
  }

  async runDecryptSelectedBlockToRaw(): Promise<void> {
    const editor = this.activeMarkdownEditor();
    if (!editor) {
      new Notice("Open a Markdown note first.");
      return;
    }

    await this.decryptSelectedBlockToRaw(editor);
  }

  runHideRevealedBlocks(): void {
    this.hideRevealedBlocks();
  }

  async runChangePassword(): Promise<void> {
    await this.changePassword();
  }

  async runShowRecovery(): Promise<void> {
    await this.showRecovery();
  }

  async runRestoreFromRecovery(): Promise<void> {
    await this.restoreFromRecovery();
  }

  runRotateVaultKey(): void {
    new Notice("Vault-key rotation is reserved for a future migration flow.");
  }

  private registerStatusBar(): void {
    const item = this.addStatusBarItem();
    item.addClass("lockblock-status");
    item.setAttr("role", "button");
    item.setAttr("tabindex", "0");
    item.setAttr("aria-label", "Lockblock status");

    const icon = item.createSpan({ cls: "lockblock-status-icon" });
    const label = item.createSpan({ cls: "lockblock-status-label" });
    this.statusBarItem = item;
    this.statusBarIcon = icon;
    this.statusBarLabel = label;

    this.registerDomEvent(item, "click", () => {
      void this.runStatusBarAction();
    });
    this.registerDomEvent(item, "keydown", (event) => {
      if (event.key !== "Enter" && event.key !== " ") {
        return;
      }

      event.preventDefault();
      void this.runStatusBarAction();
    });

    const unsubscribe = this.onLockStateChange(() => this.updateStatusBar());
    this.register(unsubscribe);
    this.statusBarTimer = window.setInterval(() => this.updateStatusBar(), 30_000);
    this.registerInterval(this.statusBarTimer);
    this.updateStatusBar();
  }

  private async runStatusBarAction(): Promise<void> {
    const state = this.getVaultLockState();
    if (state === "not-setup") {
      await this.runSetup();
    } else if (state === "locked") {
      await this.runUnlock();
    } else {
      await this.runLock();
    }
  }

  private updateStatusBar(): void {
    if (!this.statusBarItem || !this.statusBarLabel || !this.statusBarIcon) {
      return;
    }

    const displayState: StatusBarState = this.backgroundLockTimer !== null && this.isUnlocked() ? "locking" : this.getVaultLockState();
    const label = this.statusBarLabelFor(displayState);
    const icon = this.statusBarIconFor(displayState);
    this.statusBarLabel.setText(label);
    this.statusBarItem.setAttr("aria-label", `Lockblock: ${label}`);
    this.statusBarItem.setAttr("title", this.statusBarTitleFor(displayState));
    this.statusBarItem.toggleClass("lockblock-status-unlocked", displayState === "unlocked");
    this.statusBarItem.toggleClass("lockblock-status-locked", displayState === "locked");
    this.statusBarItem.toggleClass("lockblock-status-setup", displayState === "not-setup");
    this.statusBarItem.toggleClass("lockblock-status-locking", displayState === "locking");

    this.statusBarIcon.empty();
    setIcon(this.statusBarIcon, icon);
  }

  private statusBarLabelFor(state: StatusBarState): string {
    if (state === "not-setup") {
      return "Lockblock setup";
    }
    if (state === "locking") {
      return "Locking soon";
    }

    return state === "unlocked" ? "Lockblock unlocked" : "Lockblock locked";
  }

  private statusBarTitleFor(state: StatusBarState): string {
    if (state === "not-setup") {
      return "Set up Lockblock";
    }
    if (state === "locked") {
      return "Unlock Lockblock";
    }

    return "Lock Lockblock";
  }

  private statusBarIconFor(state: StatusBarState): string {
    if (state === "not-setup") {
      return "shield-alert";
    }
    if (state === "unlocked") {
      return "unlock";
    }

    return "lock";
  }

  private forgetSessionKeys(previousState = this.getVaultLockState()): void {
    this.cancelSessionLock();
    this.keyring.lock();
    this.hideRevealedBlocks(false);
    this.refreshRenderedCards();
    this.notifyLockStateChanged(previousState);
  }

  private async ensureUnlocked(): Promise<boolean> {
    if (this.keyring.session) {
      return true;
    }

    return this.runUnlock();
  }

  private async encryptSelectedPlaintextBlock(editor: Editor, showNotice: boolean): Promise<boolean> {
    if (this.encrypting || !(await this.ensureUnlocked()) || !this.keyring.session) {
      return false;
    }

    const markdown = editor.getValue();
    const block = this.currentEncryptedBlock(editor, markdown);
    if (!block) {
      if (showNotice) {
        new Notice("Select a lockblock block first.");
      }
      return false;
    }
    if (block.header) {
      if (showNotice) {
        new Notice("Selected lockblock is already encrypted.");
      }
      return false;
    }
    if (block.body.trim().length === 0) {
      if (showNotice) {
        new Notice("Selected lockblock is empty.");
      }
      return false;
    }

    this.encrypting = true;
    try {
      const sealed = await encryptBlock(block.body, this.keyring.session.vaultKey, this.keyring.session.kid);
      editor.replaceRange(formatSealedBlock(block, serializeSealedHeader(sealed)), editor.offsetToPos(block.from), editor.offsetToPos(block.to));
      if (showNotice) {
        new Notice("Encrypted selected lockblock.");
      }
      return true;
    } catch (error) {
      new Notice(`Encryption failed: ${messageFromError(error)}`);
      return false;
    } finally {
      this.encrypting = false;
    }
  }

  private async encryptPlaintextBlocksInEditor(editor: Editor, showNotice: boolean): Promise<number> {
    if (this.encrypting || !(await this.ensureUnlocked()) || !this.keyring.session) {
      return 0;
    }

    const markdown = editor.getValue();
    const plaintextBlocks = findEncryptedBlocks(markdown).filter((block) => !block.sealed && block.body.trim().length > 0);

    if (plaintextBlocks.length === 0) {
      if (showNotice) {
        new Notice("No plaintext encrypted blocks found.");
      }
      return 0;
    }

    this.encrypting = true;
    try {
      const replacements: Array<{ block: EncryptedBlock; replacement: string }> = [];
      for (const block of plaintextBlocks) {
        const sealed = await encryptBlock(block.body, this.keyring.session.vaultKey, this.keyring.session.kid);
        replacements.push({ block, replacement: formatSealedBlock(block, serializeSealedHeader(sealed)) });
      }

      for (const { block, replacement } of replacements.reverse()) {
        editor.replaceRange(replacement, editor.offsetToPos(block.from), editor.offsetToPos(block.to));
      }

      if (showNotice) {
        new Notice(`Encrypted ${replacements.length} block${replacements.length === 1 ? "" : "s"}.`);
      }

      return replacements.length;
    } catch (error) {
      new Notice(`Encryption failed: ${messageFromError(error)}`);
      return 0;
    } finally {
      this.encrypting = false;
    }
  }

  private async encryptActiveEditorBeforeLock(): Promise<void> {
    const editor = this.activeMarkdownEditor();
    if (editor && this.keyring.session) {
      await this.encryptPlaintextBlocksInEditor(editor, false);
    }
  }

  private async decryptSealedBlocksInEditor(editor: Editor): Promise<number> {
    if (!this.keyring.session) {
      return 0;
    }

    const markdown = editor.getValue();
    const sealedBlocks = findEncryptedBlocks(markdown).filter((block) => block.header !== null);
    if (sealedBlocks.length === 0) {
      return 0;
    }

    const replacements: Array<{ block: EncryptedBlock; replacement: string }> = [];
    for (const block of sealedBlocks) {
      if (!block.header || block.header.kid !== this.keyring.session.kid) {
        continue;
      }

      try {
        const plaintext = await decryptBlock(block.header, this.keyring.session.vaultKey);
        replacements.push({ block, replacement: formatPlaintextBlock(block, plaintext) });
      } catch {
        new Notice("Could not decrypt a lockblock for editing.");
      }
    }

    for (const { block, replacement } of replacements.reverse()) {
      editor.replaceRange(replacement, editor.offsetToPos(block.from), editor.offsetToPos(block.to));
    }

    return replacements.length;
  }

  private async decryptActiveEditorForEditing(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (view?.getMode() === "source") {
      await this.decryptSealedBlocksInEditor(view.editor);
    }
  }

  private async revealSelectedBlock(editor: Editor): Promise<void> {
    const plaintext = await this.decryptSelectedEditorBlock(editor);
    if (plaintext !== null) {
      await showPlaintext(this.app, "Decrypted block", plaintext);
    }
  }

  private async copySelectedBlock(editor: Editor): Promise<void> {
    const plaintext = await this.decryptSelectedEditorBlock(editor);
    if (plaintext === null) {
      return;
    }

    await navigator.clipboard.writeText(plaintext);
    new Notice("Copied decrypted block.");
  }

  private async decryptSelectedBlockToRaw(editor: Editor): Promise<void> {
    const markdown = editor.getValue();
    const block = this.currentEncryptedBlock(editor, markdown);
    if (!block) {
      new Notice("Select an encrypted block first.");
      return;
    }
    if (!block.header) {
      new Notice("Selected encrypted block is already plaintext.");
      return;
    }

    if (this.settings.confirmDecryptToRaw) {
      const confirmed = await confirmAction(
        this.app,
        "Decrypt to raw plaintext?",
        "This will replace sealed ciphertext in the note with readable plaintext.",
        "Decrypt to raw",
      );
      if (!confirmed) {
        return;
      }
    }

    const plaintext = await this.decryptHeader(block.header);
    if (plaintext === null) {
      return;
    }

    editor.replaceRange(formatPlaintextBlock(block, plaintext), editor.offsetToPos(block.from), editor.offsetToPos(block.to));
    new Notice("Block decrypted to raw plaintext.");
  }

  private async decryptSelectedEditorBlock(editor: Editor): Promise<string | null> {
    const markdown = editor.getValue();
    const block = this.currentEncryptedBlock(editor, markdown);
    if (!block) {
      new Notice("Select an encrypted block first.");
      return null;
    }
    if (!block.header) {
      return block.body;
    }

    return this.decryptHeader(block.header);
  }

  private currentEncryptedBlock(editor: Editor, markdown: string): EncryptedBlock | null {
    const from = editor.posToOffset(editor.getCursor("from"));
    const to = editor.posToOffset(editor.getCursor("to"));
    return selectedBlock(markdown, from, to);
  }

  private async decryptHeader(header: SealedBlockHeader): Promise<string | null> {
    if (!(await this.ensureUnlocked()) || !this.keyring.session) {
      return null;
    }
    if (header.kid !== this.keyring.session.kid) {
      new Notice(`This block uses key ${header.kid}, but only ${this.keyring.session.kid} is loaded.`);
      return null;
    }

    try {
      return await decryptBlock(header, this.keyring.session.vaultKey);
    } catch {
      new Notice("Could not decrypt this block. It may be corrupt or from a different key.");
      return null;
    }
  }

  private async changePassword(): Promise<void> {
    const result = await askForPassword(this.app, "change");
    if (!result?.currentPassword || !result.nextPassword) {
      return;
    }

    try {
      const previousState = this.getVaultLockState();
      await this.keyring.changePassword(result.currentPassword, result.nextPassword, this.settings.kdfIterations);
      await this.syncKeyringToSettings();
      this.scheduleSessionLock();
      this.refreshRenderedCards();
      this.notifyLockStateChanged(previousState);
      new Notice("Unlock password changed.");
    } catch {
      new Notice("Password change failed. Check the current password and try again.");
    }
  }

  private async showRecovery(): Promise<void> {
    const result = await askForPassword(this.app, "showRecovery");
    if (!result?.password) {
      return;
    }

    try {
      const recoveryKey = await this.keyring.showRecoveryKey(result.password, this.settings.kdfIterations);
      await this.syncKeyringToSettings();
      await showRecoveryKey(this.app, recoveryKey);
    } catch {
      new Notice("Could not show recovery key. Check the password and try again.");
    }
  }

  private async restoreFromRecovery(): Promise<void> {
    const result = await askForPassword(this.app, "restore");
    if (!result?.recoveryKey || !result.nextPassword) {
      return;
    }

    try {
      const previousState = this.getVaultLockState();
      await this.keyring.restore(result.recoveryKey, result.nextPassword, this.settings.kdfIterations);
      await this.syncKeyringToSettings();
      this.scheduleSessionLock();
      this.refreshRenderedCards();
      this.notifyLockStateChanged(previousState);
      new Notice("Lockblock restored and unlocked.");
    } catch {
      new Notice("Restore failed. Check the recovery key and try again.");
    }
  }

  private renderReadingLockblockBlocks(el: HTMLElement, ctx: MarkdownPostProcessorContext): void {
    window.setTimeout(() => {
      if (!el.isConnected || !el.closest(".markdown-preview-view") || el.closest(".markdown-source-view")) {
        return;
      }

      const codeBlocks = Array.from(el.querySelectorAll<HTMLElement>(`pre > code.language-${LOCKBLOCK_BLOCK_LANGUAGE}`));
      if (el.matches(`pre > code.language-${LOCKBLOCK_BLOCK_LANGUAGE}`)) {
        codeBlocks.push(el);
      }

      for (const codeBlock of codeBlocks) {
        const pre = codeBlock.parentElement;
        if (!pre || pre.dataset.lockblockProcessed === "true") {
          continue;
        }

        pre.dataset.lockblockProcessed = "true";
        const container = pre.ownerDocument.createElement("div");
        pre.replaceWith(container);
        this.renderLockblockCard(codeBlock.textContent ?? "", container, ctx.sourcePath);
      }
    }, 0);
  }

  renderLockblockCard(source: string, el: HTMLElement, sourcePath: string): void {
    const header = parseSealedHeader(source.trim());
    const key = header ? `${sourcePath}:${header.ct}` : `${sourcePath}:${source}`;
    let registered = false;
    let hasRendered = false;

    const render = () => {
      if (!el.isConnected && hasRendered) {
        this.renderCallbacks.delete(render);
        return;
      }

      hasRendered = true;
      el.empty();
      const card = el.createDiv({ cls: "lockblock-card" });

      if (!header) {
        if (!source.trim().startsWith("lockblock:v1:") && this.keyring.session) {
          card.createDiv({ cls: "lockblock-card-title", text: "Encrypting" });
          card.createDiv({ cls: "lockblock-card-message", text: "Sealing plaintext lockblock before reading." });
          void this.encryptRenderedPlaintextBlock(sourcePath);
          return;
        }

        card.createDiv({ cls: "lockblock-card-title", text: source.trim().startsWith("lockblock:v1:") ? "Malformed encrypted block" : "Plaintext lockblock block" });
        card.createDiv({
          cls: "lockblock-card-message",
          text: source.trim().startsWith("lockblock:v1:")
            ? "Lockblock could not read this sealed block header."
            : "This block has not been sealed yet.",
        });
        return;
      }

      const revealed = this.revealed.get(key);
      const sessionUnlocked = this.keyring.session !== null;
      card.toggleClass("lockblock-card-clickable", !revealed);
      card.createDiv({ cls: "lockblock-card-title", text: revealed ? "Visible" : "Encrypted" });
      card.createDiv({
        cls: "lockblock-card-message",
        text: `${sessionUnlocked ? "Vault unlocked" : "Vault locked"} - id ${shortId(header.kid)}`,
      });

      if (revealed) {
        card.createEl("pre", { cls: "lockblock-revealed", text: revealed.plaintext });
      } else {
        card.addEventListener("click", () => {
          void this.revealPreviewBlock(header, key, render);
        });
      }

      const actions = card.createDiv({ cls: "lockblock-actions" });
      if (revealed) {
        createIconButton(actions, "Hide", "eye-off").addEventListener("click", (event) => {
          event.stopPropagation();
          this.hideReveal(key);
          render();
        });
      } else {
        createIconButton(actions, sessionUnlocked ? "Show" : "Unlock", sessionUnlocked ? "eye" : "unlock").addEventListener("click", (event) => {
          event.stopPropagation();
          void this.revealPreviewBlock(header, key, render);
        });
      }

      if (this.settings.copyWithoutReveal || revealed) {
        createIconButton(actions, "Copy", "copy").addEventListener("click", (event) => {
          event.stopPropagation();
          void this.copyPreviewBlock(header, revealed?.plaintext ?? null);
        });
      }

      if (sessionUnlocked) {
        createIconButton(actions, "Lock", "lock").addEventListener("click", (event) => {
          event.stopPropagation();
          void this.runLock();
        });
      }

      if (!registered) {
        registered = true;
        this.renderCallbacks.add(render);
      }
    };

    render();
  }

  private async encryptRenderedPlaintextBlock(sourcePath: string): Promise<void> {
    if (this.renderedFileEncrypting.has(sourcePath) || !this.keyring.session) {
      return;
    }

    const file = this.app.vault.getFileByPath(sourcePath);
    if (!(file instanceof TFile)) {
      new Notice("Could not find note to seal lockblock.");
      return;
    }

    this.renderedFileEncrypting.add(sourcePath);
    try {
      await this.encryptRenderedPlaintextBlockAsync(file);
    } catch (error) {
      new Notice(`Could not seal lockblock: ${messageFromError(error)}`);
    } finally {
      this.renderedFileEncrypting.delete(sourcePath);
    }
  }

  private async encryptRenderedPlaintextBlockAsync(file: TFile): Promise<void> {
    if (!this.keyring.session) {
      return;
    }

    const markdown = await this.app.vault.read(file);
    const plaintextBlocks = findEncryptedBlocks(markdown).filter((block) => !block.sealed && block.body.trim().length > 0);
    if (plaintextBlocks.length === 0) {
      this.scheduleMarkdownRefresh();
      return;
    }

    const replacements: Array<{ block: EncryptedBlock; replacement: string }> = [];
    for (const block of plaintextBlocks) {
      if (!this.keyring.session) {
        return;
      }
      const sealed = await encryptBlock(block.body, this.keyring.session.vaultKey, this.keyring.session.kid);
      replacements.push({ block, replacement: formatSealedBlock(block, serializeSealedHeader(sealed)) });
    }

    let nextMarkdown = markdown;
    for (const { block, replacement } of replacements.reverse()) {
      nextMarkdown = `${nextMarkdown.slice(0, block.from)}${replacement}${nextMarkdown.slice(block.to)}`;
    }

    await this.app.vault.modify(file, nextMarkdown);
    this.scheduleMarkdownRefresh();
  }

  private async revealPreviewBlock(header: SealedBlockHeader, key: string, refresh: () => void): Promise<void> {
    const plaintext = await this.decryptHeader(header);
    if (plaintext === null) {
      return;
    }

    const timeout = this.settings.autoHideRevealedSeconds > 0
      ? window.setTimeout(() => {
          this.hideReveal(key);
          refresh();
        }, this.settings.autoHideRevealedSeconds * 1000)
      : null;

    this.hideReveal(key);
    this.revealed.set(key, { plaintext, timeout });
    refresh();
  }

  private async copyPreviewBlock(header: SealedBlockHeader, plaintext: string | null): Promise<void> {
    const value = plaintext ?? (await this.decryptHeader(header));
    if (value === null) {
      return;
    }

    await navigator.clipboard.writeText(value);
    new Notice("Copied decrypted block.");
  }

  private hideRevealedBlocks(showNotice = true): void {
    for (const key of this.revealed.keys()) {
      this.hideReveal(key);
    }

    for (const refresh of Array.from(this.renderCallbacks)) {
      refresh();
    }

    if (showNotice) {
      new Notice("Revealed lockblock cards hidden.");
    }
  }

  private refreshRenderedCards(): void {
    for (const refresh of Array.from(this.renderCallbacks)) {
      refresh();
    }
    this.app.workspace.updateOptions();
  }

  private notifyLockStateChanged(previousState: VaultLockState): void {
    const state = this.getVaultLockState();
    if (state === previousState) {
      return;
    }

    for (const callback of Array.from(this.lockStateCallbacks)) {
      try {
        callback(state);
      } catch (error) {
        console.error("Lockblock lock-state callback failed.", error);
      }
    }
  }

  private hideReveal(key: string): void {
    const entry = this.revealed.get(key);
    if (entry && entry.timeout !== null) {
      window.clearTimeout(entry.timeout);
    }
    this.revealed.delete(key);
  }

  private registerMarkdownRefresh(): void {
    this.registerEvent(this.app.workspace.on("file-open", () => this.scheduleMarkdownRefresh()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.scheduleMarkdownRefresh()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.scheduleMarkdownRefresh()));
  }

  private scheduleMarkdownRefresh(): void {
    if (this.markdownRefreshTimer !== null) {
      window.clearTimeout(this.markdownRefreshTimer);
    }

    this.markdownRefreshTimer = window.setTimeout(() => {
      this.markdownRefreshTimer = null;
      this.refreshMarkdownPreviews();
    }, 100);
  }

  private refreshMarkdownPreviews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType("markdown")) {
      const view = leaf.view;
      if (view instanceof MarkdownView && view.getMode() === "preview") {
        view.previewMode.rerender(true);
      }
    }
  }

  private registerViewAutomation(): void {
    this.registerInterval(
      window.setInterval(() => {
        if (!this.modeWatchInFlight) {
          this.modeWatchInFlight = true;
          void this.watchActiveMarkdownView().finally(() => {
            this.modeWatchInFlight = false;
          });
        }
      }, 500),
    );
  }

  private async watchActiveMarkdownView(): Promise<void> {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    if (!view) {
      this.lastActiveModeKey = null;
      return;
    }

    const mode = view.getMode();
    const path = view.file?.path ?? "";
    const modeKey = `${path}:${mode}`;

    if (modeKey !== this.lastActiveModeKey) {
      this.lastActiveModeKey = modeKey;

      if (mode === "preview") {
        await this.handleReadingViewEntry(view);
      } else if (mode === "source") {
        await this.handleSourceViewEntry(view);
      }
    }
  }

  private async handleReadingViewEntry(view: MarkdownView): Promise<void> {
    if (!this.settings.autoEncryptOnReadingView || this.encrypting) {
      return;
    }

    const editor = view.editor;
    const hasPlaintextBlocks = findEncryptedBlocks(editor.getValue()).some((block) => !block.sealed && block.body.trim().length > 0);
    if (!hasPlaintextBlocks) {
      return;
    }

    await this.encryptPlaintextBlocksInEditor(editor, false);
  }

  private async handleSourceViewEntry(view: MarkdownView): Promise<void> {
    if (!this.keyring.session) {
      const hasSealedBlocks = findEncryptedBlocks(view.editor.getValue()).some((block) => block.header !== null);
      if (hasSealedBlocks) {
        this.notifyLockedEditMode();
      }
      return;
    }

    await this.decryptSealedBlocksInEditor(view.editor);
  }

  private registerBackgroundLock(): void {
    this.registerDomEvent(activeDocument, "visibilitychange", () => {
      if (activeDocument.hidden) {
        this.scheduleBackgroundLock();
      } else {
        this.cancelBackgroundLock();
      }
    });
    this.registerDomEvent(activeWindow, "blur", () => this.scheduleBackgroundLock());
    this.registerDomEvent(activeWindow, "focus", () => this.cancelBackgroundLock());
  }

  private scheduleBackgroundLock(): void {
    if (!this.keyring.session) {
      return;
    }

    this.cancelBackgroundLock();
    this.backgroundLockTimer = window.setTimeout(
      () => {
        this.backgroundLockTimer = null;
        this.updateStatusBar();
        void this.lockAfterBackgroundTimeout();
      },
      this.settings.lockOnBackgroundMinutes * 60 * 1000,
    );
    this.updateStatusBar();
  }

  private cancelBackgroundLock(): void {
    if (this.backgroundLockTimer !== null) {
      window.clearTimeout(this.backgroundLockTimer);
      this.backgroundLockTimer = null;
      this.updateStatusBar();
    }
  }

  private scheduleSessionLock(): void {
    this.cancelSessionLock();
    if (!this.keyring.session || this.settings.sessionLockMinutes <= 0) {
      return;
    }

    this.sessionLockTimer = window.setTimeout(
      () => {
        this.sessionLockTimer = null;
        this.updateStatusBar();
        void this.lockAfterSessionTimeout();
      },
      this.settings.sessionLockMinutes * 60 * 1000,
    );
  }

  private async lockAfterBackgroundTimeout(): Promise<void> {
    await this.encryptActiveEditorBeforeLock();
    this.forgetSessionKeys();
    new Notice("Lockblock locked after Obsidian went to the background.");
  }

  private async lockAfterSessionTimeout(): Promise<void> {
    await this.encryptActiveEditorBeforeLock();
    this.forgetSessionKeys();
    new Notice("Lockblock locked after the unlocked session timed out.");
  }

  private cancelSessionLock(): void {
    if (this.sessionLockTimer !== null) {
      window.clearTimeout(this.sessionLockTimer);
      this.sessionLockTimer = null;
    }
  }

  private clearTimers(): void {
    if (this.markdownRefreshTimer !== null) {
      window.clearTimeout(this.markdownRefreshTimer);
      this.markdownRefreshTimer = null;
    }
    if (this.statusBarTimer !== null) {
      window.clearInterval(this.statusBarTimer);
      this.statusBarTimer = null;
    }
    this.cancelBackgroundLock();
    this.cancelSessionLock();
  }

  private activeMarkdownEditor(): Editor | null {
    const view = this.app.workspace.getActiveViewOfType(MarkdownView);
    return view?.editor ?? null;
  }
}

function createIconButton(parent: HTMLElement, label: string, icon: string): HTMLButtonElement {
  const button = parent.createEl("button", { cls: "lockblock-small-button" });
  const iconEl = button.createSpan({ cls: "lockblock-button-icon" });
  setIcon(iconEl, icon);
  button.createSpan({ text: label });
  button.setAttr("aria-label", label);
  return button;
}

function messageFromError(error: unknown): string {
  return error instanceof Error ? error.message : "Unknown error";
}

function isSettingsObject(value: unknown): value is Partial<LockblockSettings> {
  return typeof value === "object" && value !== null;
}

function shortId(value: string): string {
  return value.length > 12 ? `${value.slice(0, 8)}...${value.slice(-4)}` : value;
}
