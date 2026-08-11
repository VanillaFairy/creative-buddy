import { App, PluginSettingTab, Setting, Notice } from "obsidian";
import { execFile } from "node:child_process";
import type GraphBuddyPlugin from "./main";

export interface GraphBuddySettings {
  claudePath: string;        // "" = auto-detect
  defaultModel: string;      // claude-opus-5 | claude-sonnet-5 | claude-haiku-4-5
  apiKeyOverride: string;    // "" = subscription (the path)
}

export const DEFAULT_SETTINGS: GraphBuddySettings = {
  claudePath: "",
  defaultModel: "claude-sonnet-5",
  apiKeyOverride: "",
};

export const MODEL_CHOICES: Record<string, string> = {
  "claude-opus-5": "Opus 5 — deepest interviewer",
  "claude-sonnet-5": "Sonnet 5 — the daily default",
  "claude-haiku-4-5": "Haiku 4.5 — quick and cheap",
};

export class GraphBuddySettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: GraphBuddyPlugin) {
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
      .setName("Default model")
      .setDesc("Each chat tab has its own picker; this seeds new tabs.")
      .addDropdown((dd) => {
        for (const [id, label] of Object.entries(MODEL_CHOICES)) dd.addOption(id, label);
        dd.setValue(this.plugin.settings.defaultModel).onChange(async (value) => {
          this.plugin.settings.defaultModel = value;
          await this.plugin.saveSettings();
        });
      });

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
