import { Notice, Plugin, TFile, WorkspaceLeaf } from "obsidian";
import { GraphModel } from "./graph/graph-model";
import { CreativeBuddySettings, DEFAULT_SETTINGS, CreativeBuddySettingTab } from "./settings";
import { asFamily, FAMILY_NAMES, modelLabels } from "./agent/models";
import { AgentService } from "./agent/agent-service";
import { findClaudeExecutable } from "./claude-locator";
import { ChatView, CHAT_VIEW_TYPE } from "./chat/ChatView";
import { MindmapView, MINDMAP_VIEW_TYPE } from "./mindmap/MindmapView";
import { countOpenQuestions } from "./open-questions";
import { charterEdit } from "./project-list";
import { dirName } from "./graph/types";
import { CHAT_ICON, MAP_ICON, registerIcons } from "./icons";
import { existsSync } from "node:fs";

export default class CreativeBuddyPlugin extends Plugin {
  settings: CreativeBuddySettings = DEFAULT_SETTINGS;
  model: GraphModel | null = null;
  private modelReadyCallbacks: Array<() => void> = [];
  /** Bare family names until the CLI has said which version each one runs. */
  modelLabels: Record<string, string> = { ...FAMILY_NAMES };
  private modelLabelListeners = new Set<() => void>();

  /** Runs cb whenever modelLabels changes. Returns a disposer for Component.register. */
  onModelLabels(cb: () => void): () => void {
    this.modelLabelListeners.add(cb);
    return () => void this.modelLabelListeners.delete(cb);
  }

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
    registerIcons();

    this.registerView(CHAT_VIEW_TYPE, (leaf) => new ChatView(leaf, this));
    this.registerView(MINDMAP_VIEW_TYPE, (leaf) => new MindmapView(leaf, this));

    // One icon per surface, each carrying its own view's glyph: closing either
    // panel has to leave a way back to it, and a single icon can only ever
    // reopen one of them. Both read the note you are on and go straight to its
    // project, so the picker is for when there is nothing to read — and both
    // are a way *back* to that project, never a second copy of it.
    this.addRibbonIcon(CHAT_ICON, "Open Creative Buddy chat", () => {
      void this.openChat(this.activeGraphDir());
    });
    this.addRibbonIcon(MAP_ICON, "Open Creative Buddy map", () => {
      void this.openMap(this.activeGraphDir());
    });

    // Command ids are what keybindings hang on, so `new-chat-tab` keeps its id
    // even though it now says panel. Every one of these resolves the project you
    // are reading; they differ only in whether they hand back the conversation
    // you already have there (open-chat) or another one beside it
    // (new-chat-tab).
    this.addCommand({ id: "open-chat", name: "Open chat panel", callback: () => void this.openChat(this.activeGraphDir()) });
    this.addCommand({ id: "new-chat-tab", name: "New conversation", callback: () => void this.newConversation() });
    this.addCommand({ id: "open-mindmap", name: "Open graph mindmap", callback: () => void this.openMap(this.activeGraphDir()) });

    this.registerEvent(
      this.app.workspace.on("file-menu", (menu, file) => {
        if (!(file instanceof TFile) || file.extension.toLowerCase() !== "md") return;
        const graphDir = this.model?.graphOf(file.path) ?? null;
        // In the "open" section, beside Obsidian's own open-in actions, because
        // that is what these are. Offered for any note: one outside every
        // project lands on the picker rather than on nothing.
        menu.addItem((item) =>
          item
            .setSection("open")
            .setTitle("Open in Creative Buddy chat")
            .setIcon(CHAT_ICON)
            .onClick(() => void this.openChat(graphDir)),
        );
        menu.addItem((item) =>
          item
            .setSection("open")
            .setTitle("Show in Creative Buddy map")
            .setIcon(MAP_ICON)
            .onClick(() => void this.openMap(graphDir)),
        );
      }),
    );

    this.app.workspace.onLayoutReady(() => {
      void this.buildModel();
      void this.loadModelLabels();
    });
  }

  /** Asks the CLI which version each family runs. On any failure the pickers keep the bare names. */
  private async loadModelLabels(): Promise<void> {
    const claudePath = this.resolveClaudePath();
    if (claudePath === null) return;
    try {
      const rows = await new AgentService().listModels(claudePath, this.settings.apiKeyOverride);
      this.modelLabels = modelLabels(rows);
    } catch {
      return;
    }
    for (const cb of this.modelLabelListeners) cb();
  }

  onunload(): void {
    this.model = null;
  }

  /**
   * The project owning the note you are looking at. Null when no note is open,
   * when it belongs to no project, or before indexing has finished — in every
   * one of those cases the surface asks instead of guessing.
   *
   * Public because the chat panel resolves it for itself too: its "+" opens the
   * new conversation on whatever you are reading, and only the panel knows when
   * that button was pressed.
   */
  activeGraphDir(): string | null {
    const file = this.app.workspace.getActiveFile();
    if (file === null) return null;
    return this.model?.graphOf(file.path) ?? null;
  }

  /**
   * The note the user is reading, when it belongs to this graph — its path and
   * what it still owes.
   *
   * Null when nothing is open, when the index is not built yet, and — the case
   * worth naming — when the open note belongs to a *different* project. A chat tab
   * is bound to one graph, and pointing it at another one's note is the thing the
   * approval table exists to refuse. So a tab bound elsewhere sees no note at all,
   * which is also why the preset simply is not there rather than being there and
   * failing.
   *
   * `contentOf` answers "" for a path the vault no longer holds, so a note deleted
   * between an event and the render reads as owing nothing rather than throwing.
   *
   * The `.md` test is the same one `buildModel` indexes by, and it is here because
   * graph ownership is decided on the path alone: an image sitting in the project
   * folder belongs to the graph as surely as a note does. Without it, opening a
   * cover picture would tell the interviewer it is looking at a note and hand it a
   * path it cannot read.
   */
  /**
   * The folder holding the note you are reading — "" for one at the vault root,
   * null when nothing is open. Read off the path rather than the file's parent
   * folder, because Obsidian calls the root folder "/" and the whole index is
   * keyed on vault-relative paths.
   */
  activeFolderDir(): string | null {
    const file = this.app.workspace.getActiveFile();
    return file === null ? null : dirName(file.path);
  }

  /**
   * Give a folder a charter, so it becomes a project of its own.
   *
   * The model is told the moment the write lands, rather than waiting for the
   * vault event and its read to come back around: the caller binds a view to
   * this project in the next line, and binding to a dir `graphs()` does not yet
   * carry is the one thing the graph list exists to prevent.
   */
  async createProjectFrom(dir: string): Promise<boolean> {
    const model = this.model;
    if (model === null) return false;
    const edit = charterEdit(model, dir);
    if (edit === null) return true;

    try {
      const existing = this.app.vault.getAbstractFileByPath(edit.path);
      if (existing instanceof TFile) await this.app.vault.modify(existing, edit.content);
      else await this.app.vault.create(edit.path, edit.content);
    } catch {
      new Notice(`Creative Buddy could not write ${edit.path}.`);
      return false;
    }
    model.setFile(edit.path, edit.content);
    return true;
  }

  activeNoteIn(graphDir: string): { path: string; openQuestions: number } | null {
    const file = this.app.workspace.getActiveFile();
    if (file === null || this.model === null) return null;
    if (!file.path.toLowerCase().endsWith(".md")) return null;
    if (this.model.graphOf(file.path) !== graphDir) return null;
    return { path: file.path, openQuestions: countOpenQuestions(this.model.contentOf(file.path)) };
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
  private async openChat(graphDir: string | null): Promise<void> {
    const leaf = await this.revealOrCreate(CHAT_VIEW_TYPE);
    if (leaf.view instanceof ChatView) leaf.view.openConversation(graphDir);
  }

  /** Conversations live inside the panel, so this reveals it and adds a tab. */
  private async newConversation(): Promise<void> {
    const leaf = await this.revealOrCreate(CHAT_VIEW_TYPE);
    if (leaf.view instanceof ChatView) leaf.view.newConversation();
  }

  private async openMap(graphDir: string | null): Promise<void> {
    const leaf = await this.revealOrCreate(MINDMAP_VIEW_TYPE);
    if (leaf.view instanceof MindmapView && graphDir !== null) leaf.view.showGraph(graphDir);
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
    return findClaudeExecutable({ platform: process.platform, env: process.env }, existsSync);
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
    const saved = (await this.loadData()) as Partial<CreativeBuddySettings> | null;
    this.settings = { ...DEFAULT_SETTINGS, ...saved };
    this.settings.defaultModel = asFamily(this.settings.defaultModel);
  }

  async saveSettings(): Promise<void> {
    await this.saveData(this.settings);
  }
}
