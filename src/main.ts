import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
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
    this.registerView(MINDMAP_VIEW_TYPE, (leaf) => new MindmapView(leaf, this));

    // One ribbon icon for the whole plugin. A sidebar panel already shows its
    // own icon in the sidebar's strip, so a second ribbon icon per view just
    // puts the same glyph on screen twice.
    this.addRibbonIcon("messages-square", "Open Creative Buddy", () => {
      void this.openChat();
    });

    // Command ids are what keybindings hang on, so `new-chat-tab` keeps its id
    // even though it now says panel.
    this.addCommand({ id: "open-chat", name: "Open chat panel", callback: () => void this.openChat() });
    this.addCommand({ id: "new-chat-tab", name: "New conversation", callback: () => void this.newConversation() });
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
  private async openChat(): Promise<void> {
    await this.revealOrCreate(CHAT_VIEW_TYPE);
  }

  /** Conversations live inside the panel, so this reveals it and adds a tab. */
  private async newConversation(): Promise<void> {
    const leaf = await this.revealOrCreate(CHAT_VIEW_TYPE);
    if (leaf.view instanceof ChatView) leaf.view.newConversation();
  }

  private async openMindmap(): Promise<void> {
    await this.revealOrCreate(MINDMAP_VIEW_TYPE);
  }

  /**
   * Reveal the panel that is already open, and only make one when there is
   * none — so clicking twice takes you back to your panel instead of growing
   * another. A panel open anywhere counts, including one dragged into the main
   * area, which is why the leaf lookup comes before the sidebar call.
   *
   * ensureSideLeaf rather than getRightLeaf(false): the latter hands back the
   * sidebar's most recent leaf *whatever it is showing*, and setViewState then
   * overwrites it — that is how opening the map used to destroy a chat session.
   *
   * Awaits loadIfDeferred before handing the leaf back: since Obsidian 1.7.2 a
   * background tab holds a DeferredView rather than the real view, so callers
   * testing `leaf.view instanceof ChatView` would silently do nothing for a
   * panel sitting in the background.
   */
  private async revealOrCreate(viewType: string): Promise<WorkspaceLeaf> {
    const workspace = this.app.workspace;
    const existing = workspace.getLeavesOfType(viewType)[0];
    const leaf = await this.leafFor(viewType, existing);
    await leaf.loadIfDeferred();
    return leaf;
  }

  private async leafFor(viewType: string, existing: WorkspaceLeaf | undefined): Promise<WorkspaceLeaf> {
    const workspace = this.app.workspace;
    if (existing !== undefined) {
      await workspace.revealLeaf(existing);
      return existing;
    }
    if (this.settings.openInMainTab) {
      const leaf = workspace.getLeaf("tab");
      await leaf.setViewState({ type: viewType, active: true });
      await workspace.revealLeaf(leaf);
      return leaf;
    }
    return await workspace.ensureSideLeaf(viewType, "right", { active: true, reveal: true });
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
