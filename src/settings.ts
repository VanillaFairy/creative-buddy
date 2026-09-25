import { App, PluginSettingTab, Notice, type SettingDefinitionItem } from "obsidian";
import { execFile } from "node:child_process";
import { DEFAULT_EFFORT, EFFORT_LABELS, EffortLevel, levelsFor } from "./agent/effort";
import type CreativeBuddyPlugin from "./main";

export interface CreativeBuddySettings {
  claudePath: string;        // "" = auto-detect
  defaultModel: string;      // a key of FAMILY_NAMES
  defaultEffort: EffortLevel; // seeds new conversations; ignored by models without effort
  apiKeyOverride: string;    // "" = subscription (the path)
  openInMainTab: boolean;    // false = the right sidebar
}

export const DEFAULT_SETTINGS: CreativeBuddySettings = {
  claudePath: "",
  defaultModel: "sonnet",
  defaultEffort: DEFAULT_EFFORT,
  apiKeyOverride: "",
  openInMainTab: false,
};

export class CreativeBuddySettingTab extends PluginSettingTab {
  constructor(app: App, private readonly plugin: CreativeBuddyPlugin) {
    super(app, plugin);
  }

  getSettingDefinitions(): SettingDefinitionItem<keyof CreativeBuddySettings>[] {
    // Kept in settings even while hidden, so switching off a model without
    // effort brings back the level you had rather than the default.
    const effortLevels = levelsFor(this.plugin.settings.defaultModel);
    return [
      {
        name: "Claude Code executable",
        desc: "Leave empty to auto-detect. The plugin runs on your Claude Code login (subscription billing).",
        control: { type: "text", key: "claudePath", placeholder: "auto-detect" },
      },
      {
        name: "Open in the main editor area",
        desc: "Open Creative Buddy panels as tabs in the centre instead of the right sidebar. Panels already open stay where they are.",
        control: { type: "toggle", key: "openInMainTab" },
      },
      {
        name: "Default model",
        desc: "Each conversation has its own picker; this seeds new ones.",
        control: { type: "dropdown", key: "defaultModel", options: { ...this.plugin.modelLabels } },
      },
      {
        name: "Default effort",
        desc: "How hard the interviewer thinks. Each conversation can change it mid-thread.",
        visible: effortLevels.length > 0,
        control: {
          type: "dropdown",
          key: "defaultEffort",
          options: Object.fromEntries(effortLevels.map((level) => [level, EFFORT_LABELS[level]])),
        },
      },
      {
        name: "API key override",
        desc:
          "Not the path. Only set this if you deliberately want API billing instead of your subscription. " +
          `Stored unencrypted in this vault's ${this.app.vault.configDir} folder — leave empty on synced or shared vaults.`,
        render: (setting) => {
          setting.addText((text) => {
            text.inputEl.type = "password";
            text.setValue(this.plugin.settings.apiKeyOverride).onChange(async (value) => {
              this.plugin.settings.apiKeyOverride = value.trim();
              await this.plugin.saveSettings();
            });
          });
        },
      },
      {
        name: "Health check",
        desc: "Verifies the Claude Code executable is found and runnable.",
        render: (setting) => {
          setting.addButton((btn) => btn.setButtonText("Run").onClick(() => this.healthCheck()));
        },
      },
    ];
  }

  getControlValue(key: string): unknown {
    return this.plugin.settings[key as keyof CreativeBuddySettings];
  }

  async setControlValue(key: string, value: unknown): Promise<void> {
    Object.assign(this.plugin.settings, { [key]: typeof value === "string" ? value.trim() : value });
    await this.plugin.saveSettings();
    // The effort row belongs to the model, so it is rebuilt rather than left
    // offering levels the new model would reject.
    if (key === "defaultModel") this.update();
  }

  private healthCheck(): void {
    const path = this.plugin.resolveClaudePath();
    if (path === null) {
      new Notice("Claude Code executable not found. Install Claude Code or set the path above.");
      return;
    }
    execFile(path, ["--version"], { timeout: 10_000, windowsHide: true }, (error, stdout) => {
      if (error) new Notice(`Found ${path} but it failed to run: ${error.message}`);
      else new Notice(`Claude Code ${stdout.trim()} at ${path}. Login is checked when a session starts.`);
    });
  }
}
