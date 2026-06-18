import { App, Modal, PluginSettingTab, Setting, setTooltip } from "obsidian";
import type LockblockPlugin from "./main";

type PasswordPurpose = "setup" | "unlock" | "change" | "restore" | "showRecovery";

interface PasswordModalResult {
  password?: string;
  currentPassword?: string;
  nextPassword?: string;
  recoveryKey?: string;
}

export class LockblockSettingTab extends PluginSettingTab {
  plugin: LockblockPlugin;

  constructor(app: App, plugin: LockblockPlugin) {
    super(app, plugin);
    this.plugin = plugin;
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();
    new Setting(containerEl).setName("Encryption").setHeading();

    new Setting(containerEl)
      .setName("Auto-encrypt plaintext lockblock blocks")
      .setDesc("When unlocked, plaintext lockblock code blocks in the active note are sealed automatically.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoEncryptPlaintextBlocks).onChange(async (value) => {
          this.plugin.settings.autoEncryptPlaintextBlocks = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Encrypt when entering reading view")
      .setDesc("Seal plaintext lockblock blocks before showing the note in reading view.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.autoEncryptOnReadingView).onChange(async (value) => {
          this.plugin.settings.autoEncryptOnReadingView = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Auto-hide revealed plaintext")
      .setDesc("Seconds before revealed preview cards hide themselves. Use 0 to keep them visible until hidden manually.")
      .addSlider((slider) => {
        const format = formatSeconds;
        const valueEl = createSliderValue(containerEl, slider.sliderEl.parentElement, format(this.plugin.settings.autoHideRevealedSeconds));
        updateSliderTooltip(slider.sliderEl, format(this.plugin.settings.autoHideRevealedSeconds));

        slider
          .setInstant(true)
          .setLimits(0, 600, 5)
          .setValue(this.plugin.settings.autoHideRevealedSeconds)
          .onChange(async (value) => {
            this.plugin.settings.autoHideRevealedSeconds = value;
            valueEl.setText(format(value));
            updateSliderTooltip(slider.sliderEl, format(value));
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Copy without reveal action")
      .setDesc("Show a copy action on locked cards without revealing plaintext on screen.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.copyWithoutReveal).onChange(async (value) => {
          this.plugin.settings.copyWithoutReveal = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Require confirmation before decrypt-to-raw")
      .setDesc("Ask before replacing sealed ciphertext with plaintext in a note.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.confirmDecryptToRaw).onChange(async (value) => {
          this.plugin.settings.confirmDecryptToRaw = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Lock on app hidden/background")
      .setDesc("Minutes after Obsidian is hidden before lockblock forgets the in-memory vault key. Use 0 to lock immediately.")
      .addSlider((slider) => {
        const format = formatMinutes;
        const valueEl = createSliderValue(containerEl, slider.sliderEl.parentElement, format(this.plugin.settings.lockOnBackgroundMinutes));
        updateSliderTooltip(slider.sliderEl, format(this.plugin.settings.lockOnBackgroundMinutes));

        slider
          .setInstant(true)
          .setLimits(0, 60, 1)
          .setValue(this.plugin.settings.lockOnBackgroundMinutes)
          .onChange(async (value) => {
            this.plugin.settings.lockOnBackgroundMinutes = value;
            valueEl.setText(format(value));
            updateSliderTooltip(slider.sliderEl, format(value));
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Unlocked session timeout")
      .setDesc("Minutes before lockblock forgets the in-memory vault key after unlock. Use 0 to keep it unlocked until lock, forget, or background lock.")
      .addSlider((slider) => {
        const format = formatOptionalMinutes;
        const valueEl = createSliderValue(containerEl, slider.sliderEl.parentElement, format(this.plugin.settings.sessionLockMinutes));
        updateSliderTooltip(slider.sliderEl, format(this.plugin.settings.sessionLockMinutes));

        slider
          .setInstant(true)
          .setLimits(0, 1_440, 5)
          .setValue(this.plugin.settings.sessionLockMinutes)
          .onChange(async (value) => {
            this.plugin.settings.sessionLockMinutes = value;
            valueEl.setText(format(value));
            updateSliderTooltip(slider.sliderEl, format(value));
            await this.plugin.saveSettings();
          });
      });

    new Setting(containerEl)
      .setName("Password wrapping iterations")
      .setDesc("Advanced password wrapping cost. Higher values are slower and harder to brute-force.")
      .addText((text) => {
        text.inputEl.type = "number";
        text
          .setValue(String(this.plugin.settings.kdfIterations))
          .onChange(async (value) => {
            const parsed = Number(value);
            if (Number.isFinite(parsed)) {
              this.plugin.settings.kdfIterations = Math.round(parsed);
              await this.plugin.saveSettings();
            }
          });
      });

    new Setting(containerEl).setName("Commands").setHeading();

    new Setting(containerEl)
      .setName("Setup and session")
      .addButton((button) => button.setButtonText("Setup").onClick(() => void this.plugin.runSetup()))
      .addButton((button) => button.setButtonText("Unlock").onClick(() => void this.plugin.runUnlock()))
      .addButton((button) => button.setButtonText("Lock").onClick(() => this.plugin.runLock()))
      .addButton((button) => button.setButtonText("Forget keys").onClick(() => this.plugin.runForgetSessionKeys()));

    new Setting(containerEl)
      .setName("Visibility")
      .addButton((button) => button.setButtonText("Hide revealed").onClick(() => this.plugin.runHideRevealedBlocks()));

    new Setting(containerEl)
      .setName("Key management")
      .addButton((button) => button.setButtonText("Change password").onClick(() => void this.plugin.runChangePassword()))
      .addButton((button) => button.setButtonText("Show recovery key").onClick(() => void this.plugin.runShowRecovery()))
      .addButton((button) => button.setButtonText("Restore recovery").onClick(() => void this.plugin.runRestoreFromRecovery()))
      .addButton((button) => button.setButtonText("Rotate vault key").onClick(() => this.plugin.runRotateVaultKey()));
  }
}

export function askForPassword(app: App, purpose: PasswordPurpose): Promise<PasswordModalResult | null> {
  return new Promise((resolve) => new PasswordModal(app, purpose, resolve).open());
}

export function showRecoveryKey(app: App, recoveryKey: string): Promise<void> {
  return new Promise((resolve) => new RecoveryKeyModal(app, recoveryKey, resolve).open());
}

export function confirmAction(app: App, title: string, message: string, actionText: string): Promise<boolean> {
  return new Promise((resolve) => new ConfirmModal(app, title, message, actionText, resolve).open());
}

export function showPlaintext(app: App, title: string, plaintext: string): Promise<void> {
  return new Promise((resolve) => new PlaintextModal(app, title, plaintext, resolve).open());
}

class PasswordModal extends Modal {
  private readonly purpose: PasswordPurpose;
  private readonly resolve: (value: PasswordModalResult | null) => void;
  private submitted = false;

  constructor(app: App, purpose: PasswordPurpose, resolve: (value: PasswordModalResult | null) => void) {
    super(app);
    this.purpose = purpose;
    this.resolve = resolve;
  }

  onOpen(): void {
    const { contentEl } = this;
    const values: PasswordModalResult = {};
    contentEl.empty();
    this.titleEl.setText(titleForPurpose(this.purpose));

    if (this.purpose === "change") {
      addPasswordField(contentEl, "Current password", (value) => (values.currentPassword = value));
      addPasswordField(contentEl, "New password", (value) => (values.nextPassword = value));
    } else if (this.purpose === "restore") {
      addTextArea(contentEl, "Recovery key", (value) => (values.recoveryKey = value.trim()));
      addPasswordField(contentEl, "New password", (value) => (values.nextPassword = value));
    } else {
      addPasswordField(contentEl, this.purpose === "setup" ? "Unlock password" : "Password", (value) => (values.password = value));
    }

    new Setting(contentEl)
      .addButton((button) =>
        button.setButtonText("Cancel").onClick(() => {
          this.close();
        }),
      )
      .addButton((button) =>
        button
          .setButtonText(primaryTextForPurpose(this.purpose))
          .setCta()
          .onClick(() => {
            this.submitted = true;
            this.resolve(values);
            this.close();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
    if (!this.submitted) {
      this.resolve(null);
    }
  }
}

class RecoveryKeyModal extends Modal {
  private readonly recoveryKey: string;
  private readonly resolve: () => void;

  constructor(app: App, recoveryKey: string, resolve: () => void) {
    super(app);
    this.recoveryKey = recoveryKey;
    this.resolve = resolve;
  }

  onOpen(): void {
    this.titleEl.setText("Recovery key");
    this.contentEl.empty();
    this.contentEl.createEl("p", {
      text: "Store this recovery key somewhere safe. It can restore access if the unlock password is lost.",
    });
    this.contentEl.createEl("textarea", {
      cls: "lockblock-recovery-key",
      text: this.recoveryKey,
      attr: { readonly: "true" },
    });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Copy").onClick(() => navigator.clipboard.writeText(this.recoveryKey)))
      .addButton((button) => button.setButtonText("Done").setCta().onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve();
  }
}

class ConfirmModal extends Modal {
  private readonly message: string;
  private readonly actionText: string;
  private readonly resolve: (confirmed: boolean) => void;
  private confirmed = false;

  constructor(app: App, title: string, message: string, actionText: string, resolve: (confirmed: boolean) => void) {
    super(app);
    this.titleEl.setText(title);
    this.message = message;
    this.actionText = actionText;
    this.resolve = resolve;
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("p", { text: this.message });
    new Setting(this.contentEl)
      .addButton((button) => button.setButtonText("Cancel").onClick(() => this.close()))
      .addButton((button) =>
        button
          .setButtonText(this.actionText)
          .setCta()
          .onClick(() => {
            this.confirmed = true;
            this.close();
          }),
      );
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve(this.confirmed);
  }
}

class PlaintextModal extends Modal {
  private readonly title: string;
  private readonly plaintext: string;
  private readonly resolve: () => void;

  constructor(app: App, title: string, plaintext: string, resolve: () => void) {
    super(app);
    this.title = title;
    this.plaintext = plaintext;
    this.resolve = resolve;
  }

  onOpen(): void {
    this.titleEl.setText(this.title);
    this.contentEl.empty();
    this.contentEl.createEl("pre", { cls: "lockblock-plaintext-modal", text: this.plaintext });
    new Setting(this.contentEl).addButton((button) => button.setButtonText("Close").setCta().onClick(() => this.close()));
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolve();
  }
}

function addPasswordField(containerEl: HTMLElement, name: string, onChange: (value: string) => void): void {
  new Setting(containerEl).setName(name).addText((text) => {
    text.inputEl.type = "password";
    text.onChange(onChange);
  });
}

function addTextArea(containerEl: HTMLElement, name: string, onChange: (value: string) => void): void {
  new Setting(containerEl).setName(name).addTextArea((text) => text.onChange(onChange));
}

function createSliderValue(containerEl: HTMLElement, parentEl: HTMLElement | null, value: string): HTMLElement {
  const valueEl = containerEl.createSpan({ cls: "lockblock-slider-value", text: value });
  parentEl?.appendChild(valueEl);
  return valueEl;
}

function updateSliderTooltip(sliderEl: HTMLInputElement, value: string): void {
  sliderEl.setAttr("aria-valuetext", value);
  sliderEl.setAttr("title", value);
  setTooltip(sliderEl, value);
}

function formatSeconds(value: number): string {
  return `${value}s`;
}

function formatMinutes(value: number): string {
  return `${value}m`;
}

function formatOptionalMinutes(value: number): string {
  return value === 0 ? "Never" : `${value}m`;
}

function titleForPurpose(purpose: PasswordPurpose): string {
  switch (purpose) {
    case "setup":
      return "Set up Lockblock";
    case "unlock":
      return "Unlock Lockblock";
    case "change":
      return "Change unlock password";
    case "restore":
      return "Restore from recovery key";
    case "showRecovery":
      return "Show recovery key";
  }
}

function primaryTextForPurpose(purpose: PasswordPurpose): string {
  switch (purpose) {
    case "setup":
      return "Set up";
    case "unlock":
      return "Unlock";
    case "change":
      return "Change password";
    case "restore":
      return "Restore";
    case "showRecovery":
      return "Show key";
  }
}
