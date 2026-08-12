import { Notice, Plugin, TFile } from "obsidian";
import { GraphModel } from "./graph/graph-model";
import { CreativeBuddySettings, DEFAULT_SETTINGS, CreativeBuddySettingTab } from "./settings";
import { findClaudeExecutable } from "./claude-locator";
import { ChatView, CHAT_VIEW_TYPE } from "./chat/ChatView";
import { MindmapView, MINDMAP_VIEW_TYPE } from "./mindmap/MindmapView";
import { existsSync } from "node:fs";

export default class CreativeBuddyPlugin extends Plugin {
  settings: CreativeBuddySettings = DEFAULT_SETTINGS;
  model: GraphModel | null = null;
  private modelReadyCallbacks: Array<() => void> = [];

  /**
   * Runs cb once the vault index exists — immediately if it already does.
   * Views opened before seeding finishes use this to wake up. Returns a
   * disposer; route it through Component.register so a closed view cannot
   * be resurrected by a late-arriving model.
   */
  onModelReady(cb: () => void): () => void {
    if (this.model !== null) {
      cb();
      return () => undefined;
    }
    this.modelReadyCallbacks.push(cb);
    return () => {
      this.modelReadyCallbacks = this.modelReadyCallbacks.filter((c) => c !== cb);
    };
  }

  async onload(): Promise<void> {
    await this.loadSettings();
    this.addSettingTab(new CreativeBuddySettingTab(this.app, this));

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));
    this.addRibbonIcon("messages-square", "Creative Buddy: new chat panel", () => {
      void this.openChatTab();
    });
    // Command ids are keybinding keys — the wording moved to the sidebar, the id must not.
    this.addCommand({ id: "new-chat-tab", name: "New graph chat panel", callback: () => void this.openChatTab() });

    this.registerView(MINDMAP_VIEW_TYPE, (leaf) => new MindmapView(leaf, this));
    this.addRibbonIcon("git-fork", "Creative Buddy: open graph mindmap", () => {
      void this.openMindmap();
    });
    this.addCommand({ id: "open-mindmap", name: "Open graph mindmap", callback: () => void this.openMindmap() });

    this.app.workspace.onLayoutReady(() => {
      void this.buildModel();
    });
  }

  onunload(): void {
    this.model = null;
  }

  /**
   * Both surfaces live in the right sidebar, beside the vault rather than in
   * it — you read and edit notes in the main area while the buddy watches from
   * the side. getRightLeaf only returns null where there is no right sidebar
   * at all, so the main area is the fallback rather than the intent.
   *
   * revealLeaf on every path, because a sidebar the user has collapsed would
   * otherwise swallow the panel they just asked for.
   */
  private async openChatTab(): Promise<void> {
    // A fresh leaf every time — one panel, one session. split:true splits off
    // the sidebar's current leaf rather than taking it over, so opening a chat
    // never costs you the panel already docked there.
    const leaf = this.app.workspace.getRightLeaf(true) ?? this.app.workspace.getLeaf(true);
    await leaf.setViewState({ type: CHAT_VIEW_TYPE, active: true });
    await this.app.workspace.revealLeaf(leaf);
  }

  /**
   * The mindmap is one shared surface — reveal the open one, or make the first.
   *
   * ensureSideLeaf rather than getRightLeaf(false): the latter hands back the
   * sidebar's most recent leaf *whatever it is showing*, so setViewState then
   * overwrites it — opening the map on top of a chat panel silently destroyed
   * that session. ensureSideLeaf exists to avoid exactly that.
   */
  private async openMindmap(): Promise<void> {
    // A map open anywhere already is the map, including one dragged into the
    // main area — reveal it rather than growing a second copy in the sidebar.
    const existing = this.app.workspace.getLeavesOfType(MINDMAP_VIEW_TYPE)[0];
    if (existing !== undefined) {
      await this.app.workspace.revealLeaf(existing);
      return;
    }
    await this.app.workspace.ensureSideLeaf(MINDMAP_VIEW_TYPE, "right", { active: true, reveal: true });
  }

  private async buildModel(): Promise<void> {
    const vaultName = this.app.vault.getName();
    const model = new GraphModel(vaultName);

    const refresh = (file: TFile): void => {
      if (!file.path.toLowerCase().endsWith(".md")) return;
      this.app.vault.cachedRead(file).then(
        (content) => model.setFile(file.path, content),
        () => undefined, // the file vanished between the event and the read
      );
    };
    // Subscribed before the seeding loop below: an edit that lands mid-seed then costs
    // one harmless re-read instead of being dropped on the floor.
    this.registerEvent(this.app.vault.on("create", (f) => f instanceof TFile && refresh(f)));
    this.registerEvent(this.app.vault.on("modify", (f) => f instanceof TFile && refresh(f)));
    this.registerEvent(
      this.app.vault.on("delete", (f) => {
        if (f instanceof TFile) model.deleteFile(f.path);
      }),
    );
    this.registerEvent(
      this.app.vault.on("rename", (f, oldPath) => {
        if (f instanceof TFile) {
          model.renameFile(oldPath, f.path);
          refresh(f);
        }
      }),
    );

    let failures = 0;
    for (const file of this.app.vault.getFiles()) {
      if (!file.path.toLowerCase().endsWith(".md")) continue;
      try {
        model.setFile(file.path, await this.app.vault.cachedRead(file));
      } catch {
        failures += 1; // a vanished or unreadable file must not abort the whole index
      }
    }
    if (failures > 0) new Notice(`Creative Buddy: ${failures} file(s) could not be read while indexing.`);
    this.model = model;
    const waiting = this.modelReadyCallbacks;
    this.modelReadyCallbacks = [];
    for (const cb of waiting) cb();
  }

  resolveClaudePath(): string | null {
    if (this.settings.claudePath !== "") return existsSync(this.settings.claudePath) ? this.settings.claudePath : null;
    return findClaudeExecutable({ platform: process.platform, env: process.env as Record<string, string | undefined> }, existsSync);
  }

  vaultRootPath(): string {
    const adapter = this.app.vault.adapter as { getBasePath?: () => string };
    if (!adapter.getBasePath) {
      new Notice("Creative Buddy needs a vault on the local filesystem — this vault's storage adapter has no disk path.");
      return "";
    }
    return adapter.getBasePath();
  }

  async loadSettings(): Promise<void> {
    this.settings = { ...DEFAULT_SETTINGS, ...((await this.loadData()) ?? {}) };
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
