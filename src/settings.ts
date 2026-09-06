import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import { execFile } from "node:child_process";
import { DEFAULT_EFFORT, EFFORT_LABELS, EffortLevel, levelsFor } from "./agent/effort";
import type CreativeBuddyPlugin from "./main";

export interface CreativeBuddySettings {
  claudePath: string;        // "" = auto-detect
  defaultModel: string;      // a key of MODEL_CHOICES
  defaultEffort: EffortLevel; // seeds new conversations; ignored by models without effort
  apiKeyOverride: string;    // "" = subscription (the path)
  openInMainTab: boolean;    // false = the right sidebar
}

export const DEFAULT_SETTINGS: CreativeBuddySettings = {
  claudePath: "",
  defaultModel: "claude-sonnet-5",
  defaultEffort: DEFAULT_EFFORT,
  apiKeyOverride: "",
  openInMainTab: false,
};

export const MODEL_CHOICES: Record<string, string> = {
  "claude-fable-5-1": "Fable 5.1 — ultimate mastermind",
  "claude-opus-5": "Opus 5 — deepest interviewer",
  "claude-sonnet-5": "Sonnet 5 — the daily default",
  "claude-haiku-4-5": "Haiku 4.5 — quick and cheap",
};

export class CreativeBuddySettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: CreativeBuddyPlugin) {
    super(app, plugin);
  }

  display(): void {
    const { containerEl } = this;
    containerEl.empty();

    new Setting(containerEl)
      .setName("Claude Code executable")
      .setDesc("Leave empty to auto-detect. The plugin runs on your Claude Code login (subscription billing).")
      .addText((text) =>
        text
          .setPlaceholder("auto-detect")
          .setValue(this.plugin.settings.claudePath)
          .onChange(async (value) => {
            this.plugin.settings.claudePath = value.trim();
            await this.plugin.saveSettings();
          }),
      );

    new Setting(containerEl)
      .setName("Open in the main editor area")
      .setDesc("Open Creative Buddy panels as tabs in the centre instead of the right sidebar. Panels already open stay where they are.")
      .addToggle((toggle) =>
        toggle.setValue(this.plugin.settings.openInMainTab).onChange(async (value) => {
          this.plugin.settings.openInMainTab = value;
          await this.plugin.saveSettings();
        }),
      );

    new Setting(containerEl)
      .setName("Default model")
      .setDesc("Each conversation has its own picker; this seeds new ones.")
      .addDropdown((dd) => {
        for (const [id, label] of Object.entries(MODEL_CHOICES)) dd.addOption(id, label);
        dd.setValue(this.plugin.settings.defaultModel).onChange(async (value) => {
          this.plugin.settings.defaultModel = value;
          await this.plugin.saveSettings();
          // The effort row below belongs to this model, so it is redrawn rather
          // than left offering levels the new model would reject.
          this.display();
        });
      });

    // Kept in settings even while hidden, so switching off a model without
    // effort brings back the level you had rather than the default.
    const effortLevels = levelsFor(this.plugin.settings.defaultModel);
    if (effortLevels.length > 0) {
      new Setting(containerEl)
        .setName("Default effort")
        .setDesc("How hard the interviewer thinks. Each conversation can change it mid-thread.")
        .addDropdown((dd) => {
          for (const level of effortLevels) dd.addOption(level, EFFORT_LABELS[level]);
          dd.setValue(this.plugin.settings.defaultEffort).onChange(async (value) => {
            this.plugin.settings.defaultEffort = value as EffortLevel;
            await this.plugin.saveSettings();
          });
        });
    }

    new Setting(containerEl)
      .setName("API key override")
      .setDesc(
        "Not the path. Only set this if you deliberately want API billing instead of your subscription. " +
          "Stored unencrypted in this vault's .obsidian folder — leave empty on synced or shared vaults.",
      )
      .addText((text) => {
        text.inputEl.type = "password";
        text.setValue(this.plugin.settings.apiKeyOverride).onChange(async (value) => {
          this.plugin.settings.apiKeyOverride = value.trim();
          await this.plugin.saveSettings();
        });
      });

    new Setting(containerEl)
      .setName("Health check")
      .setDesc("Verifies the Claude Code executable is found and runnable.")
      .addButton((btn) =>
        btn.setButtonText("Run").onClick(() => {
          const path = this.plugin.resolveClaudePath();
          if (path === null) {
            new Notice("Claude Code executable not found. Install Claude Code or set the path above.");
            return;
          }
          execFile(path, ["--version"], { timeout: 10_000, windowsHide: true }, (error, stdout) => {
            if (error) new Notice(`Found ${path} but it failed to run: ${error.message}`);
            else new Notice(`Claude Code ${stdout.trim()} at ${path}. Login is checked when a session starts.`);
          });
        }),
      );
  }
}
