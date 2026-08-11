import { Plugin, TFile } from "obsidian";
import { GraphModel } from "./graph/graph-model";
import { GraphBuddySettings, DEFAULT_SETTINGS, GraphBuddySettingTab } from "./settings";
import { findClaudeExecutable } from "./claude-locator";
import { ChatView, CHAT_VIEW_TYPE } from "./chat/ChatView";
import { existsSync } from "node:fs";

export default class GraphBuddyPlugin extends Plugin {
  settings: GraphBuddySettings = DEFAULT_SETTINGS;
  model: GraphModel | null = null;

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new GraphBuddySettingTab(this.app, this));

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));
    this.addRibbonIcon("messages-square", "Graph Buddy: new chat tab", () => {
      void this.openChatTab();
    });
    this.addCommand({ id: "new-chat-tab", name: "New graph chat tab", callback: () => void this.openChatTab() });

    this.app.workspace.onLayoutReady(() => {
      void this.buildModel();
    });
  }

  onunload(): void {
    this.model = null;
  }

  /** A chat tab always opens as a new tab — one tab, one session. */
  private async openChatTab(): Promise<void> {
    await this.app.workspace.getLeaf(true).setViewState({ type: CHAT_VIEW_TYPE, active: true });
  }

  private async buildModel(): Promise<void> {
    const vaultName = this.app.vault.getName();
    const model = new GraphModel(vaultName);

    const refresh = async (file: TFile): Promise<void> => {
      if (!file.path.toLowerCase().endsWith(".md")) return;
      model.setFile(file.path, await this.app.vault.cachedRead(file));
    };
    // Subscribed before the seeding loop below: an edit that lands mid-seed then costs
    // one harmless re-read instead of being dropped on the floor.
    this.registerEvent(this.app.vault.on("create", (f) => f instanceof TFile && void refresh(f)));
    this.registerEvent(this.app.vault.on("modify", (f) => f instanceof TFile && void refresh(f)));
    this.registerEvent(
      this.app.vault.on("delete", (f) => {
        if (f instanceof TFile) model.deleteFile(f.path);
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (f, oldPath) => {
        if (f instanceof TFile) {
          model.renameFile(oldPath, f.path);
          void refresh(f);
        }
      }),
    );

    for (const file of this.app.vault.getFiles()) {
      if (!file.path.toLowerCase().endsWith(".md")) continue;
      model.setFile(file.path, await this.app.vault.cachedRead(file));
    }
    this.model = model;
  }

  resolveClaudePath(): string | null {
    if (this.settings.claudePath !== "") return existsSync(this.settings.claudePath) ? this.settings.claudePath : null;
    return findClaudeExecutable({ platform: process.platform, env: process.env as Record<string, string | undefined> }, existsSync);
  }

  vaultRootPath(): string {
    const adapter = this.app.vault.adapter as { getBasePath?: () => string };
    return adapter.getBasePath ? adapter.getBasePath() : "";
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
