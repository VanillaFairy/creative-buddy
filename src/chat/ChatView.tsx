import { ItemView, WorkspaceLeaf, MarkdownRenderer, Notice } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import type CreativeBuddyPlugin from "../main";
import { AgentService, SessionHandle } from "../agent/agent-service";
import { renderDigestForGraph } from "../agent/digest";
import { reduceTranscript, TranscriptItem, TranscriptEvent } from "./transcript";
import { ChatSurface } from "./components";
import { baseName } from "../graph/types";

export const CHAT_VIEW_TYPE = "creative-buddy-chat";

interface ChatState {
  graphDir: string | null;
  model: string;
  sessionId: string | null;
  items: TranscriptItem[];
}

export class ChatView extends ItemView {
  private root: Root | null = null;
  private state: ChatState;
  private session: SessionHandle | null = null;
  private service = new AgentService();
  private busy = false;
  private approvalSeq = 0;
  private pendingResponders = new Map<string, (allow: boolean, msg?: string) => void>();

  constructor(leaf: WorkspaceLeaf, private readonly plugin: CreativeBuddyPlugin) {
    super(leaf);
    this.state = { graphDir: null, model: plugin.settings.defaultModel, sessionId: null, items: [] };
  }

  getViewType(): string { return CHAT_VIEW_TYPE; }
  getDisplayText(): string {
    return this.state.graphDir === null ? "Graph chat" : `Chat: ${this.state.graphDir === "" ? this.app.vault.getName() : baseName(this.state.graphDir)}`;
  }
  getIcon(): string { return "messages-square"; }

  getState(): Record<string, unknown> {
    return {
      graphDir: this.state.graphDir,
      model: this.state.model,
      sessionId: this.state.sessionId,
      // Tool inputs carry whole note bodies; persisting them would grow
      // workspace.json without bound. The live session keeps them in memory.
      items: this.state.items.map((i) => (i.kind === "tool" ? { ...i, input: {} } : i)),
    };
  }

  async setState(state: unknown, result: unknown): Promise<void> {
    const s = (state ?? {}) as Partial<ChatState>;
    // A rebind to a different graph must not leak the old graph's session.
    if (this.session !== null && (s.graphDir ?? null) !== this.state.graphDir) {
      this.session.dispose();
      this.session = null;
      this.busy = false;
      this.pendingResponders.clear();
    }
    this.state = {
      graphDir: s.graphDir ?? null,
      model: s.model ?? this.plugin.settings.defaultModel,
      sessionId: s.sessionId ?? null,
      // A bubble caught mid-stream by a restart would stay "streaming" (plain
      // text, dimmed) forever — the stream it belonged to is gone.
      items: (s.items ?? []).map((i) => (i.kind === "assistant" && i.streaming ? { ...i, streaming: false } : i)),
    };
    // Restored approval items keep their old "a<N>" ids; a fresh counter would
    // reuse them and approval-resolved would flip the restored item too.
    for (const item of this.state.items) {
      if (item.kind !== "approval") continue;
      const n = Number(/^a(\d+)$/.exec(item.id)?.[1] ?? 0);
      if (n > this.approvalSeq) this.approvalSeq = n;
    }
    this.render();
    await super.setState(state as never, result as never);
  }

  async onOpen(): Promise<void> {
    this.root = createRoot(this.contentEl);
    // Wake the graph picker when indexing finishes, and recompute the
    // duplicate-tab badge whenever the workspace layout shifts.
    this.register(this.plugin.onModelReady(() => this.render()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.render()));
    this.render();
  }

  async onClose(): Promise<void> {
    this.session?.dispose();
    this.root?.unmount();
  }

  private dispatch(event: TranscriptEvent): void {
    this.state.items = reduceTranscript(this.state.items, event);
    this.app.workspace.requestSaveLayout();
    this.render();
  }

  private ensureSession(): SessionHandle | null {
    if (this.session !== null) return this.session;
    const model = this.plugin.model;
    const claudePath = this.plugin.resolveClaudePath();
    if (this.state.graphDir === null) return null;
    if (model === null) {
      new Notice("Creative Buddy is still indexing the vault — try again in a moment.");
      return null;
    }
    if (claudePath === null) {
      new Notice("Claude Code executable not found — set it in Creative Buddy settings.");
      return null;
    }
    const graphDir = this.state.graphDir;
    const stats = model.stats(graphDir);
    if (stats === null) {
      new Notice("This graph's hub note is gone — rebind the tab.");
      return null;
    }
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const report = model.obligations({ y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() });

    try {
      this.session = this.service.start(
        {
        vaultRoot: this.plugin.vaultRootPath().replace(/\\/g, "/"),
        graphDir,
        hubPath: model.hubPathOf(graphDir),
        model: this.state.model,
        claudePath,
        todayIso,
        stats,
        digestLines: renderDigestForGraph(report, graphDir),
        apiKeyOverride: this.plugin.settings.apiKeyOverride === "" ? undefined : this.plugin.settings.apiKeyOverride,
        resumeSessionId: this.state.sessionId ?? undefined,
      },
      {
        onInit: (info) => {
          this.state.sessionId = info.sessionId;
          this.app.workspace.requestSaveLayout();
        },
        onTextDelta: (text) => this.dispatch({ type: "text-delta", text }),
        onAssistantText: (text) => this.dispatch({ type: "assistant-final", text }),
        onToolUse: (use) => this.dispatch({ type: "tool-use", id: use.id, name: use.name, input: use.input, subagent: use.subagent }),
        onToolResult: (r) => this.dispatch({ type: "tool-result", toolUseId: r.toolUseId }),
        onApproval: (request) => {
          const id = `a${++this.approvalSeq}`;
          this.pendingResponders.set(id, request.respond);
          this.dispatch({
            type: "approval",
            id,
            toolName: request.toolName,
            targetPath: request.targetPath,
            reason: request.reason,
            title: request.title,
          });
        },
        onResult: (result) => {
          this.busy = false;
          this.dispatch({ type: "result", costUsd: result.totalCostUsd, isError: result.isError });
          if (this.wrapUpPending) {
            this.wrapUpPending = false;
            this.dispatch({ type: "notice", text: this.structureCheckText() });
          }
        },
        onStatus: (status) => {
          this.statusText = status;
          this.render();
        },
        onError: (error) => this.dispatch({ type: "error", message: error.message }),
        onEnd: () => {
          // claude.exe exited. Dispose the dead handle (settles any approval
          // card left pending by a mid-approval crash), then drop it so the
          // next send starts a fresh process resuming the same conversation.
          this.session?.dispose();
          this.session = null;
          this.busy = false;
          // The SDK side was told "deny" for anything still pending; the cards
          // must agree, or a click on a stale Allow would record a lie.
          for (const id of this.pendingResponders.keys()) {
            this.state.items = reduceTranscript(this.state.items, { type: "approval-resolved", id, allowed: false });
          }
          this.pendingResponders.clear();
          this.dispatch({ type: "notice", text: "The session ended. Your next message reconnects to the same conversation." });
        },
          onStderr: (line) => console.debug("[creative-buddy] claude:", line),
        },
      );
    } catch {
      this.session = null; // onError already put the failure in the transcript
    }
    return this.session;
  }

  private readonly callbacks = {
    onSend: (text: string): void => {
      const session = this.ensureSession();
      if (session === null) return;
      this.busy = true;
      this.dispatch({ type: "user-sent", text });
      session.sendUserMessage(text);
    },
    onModelChange: (model: string): void => {
      this.state.model = model;
      this.session?.setModel(model).catch(() => new Notice("Model switch failed — the session keeps its current model."));
      this.render();
    },
    onApprove: (id: string, allow: boolean, message?: string): void => {
      this.pendingResponders.get(id)?.(allow, message);
      this.pendingResponders.delete(id);
      this.dispatch({ type: "approval-resolved", id, allowed: allow });
    },
    onWrapUp: (): void => {
      const session = this.ensureSession();
      if (session === null || this.state.graphDir === null) return;
      this.busy = true;
      this.dispatch({ type: "user-sent", text: "(wrap up)" });
      session.sendUserMessage(WRAP_UP_MESSAGE);
      // The structure-check summary is appended once the turn's result lands.
      this.showWrapUpSummaryAfterResult();
    },
    onInterrupt: (): void => {
      this.session?.interrupt().catch(() => undefined);
      this.busy = false;
      this.render();
    },
    renderMarkdown: (el: HTMLElement, markdown: string): void => {
      // Relative links resolve against a NOTE path, so hand the renderer the
      // hub note rather than the graph folder.
      const dir = this.state.graphDir;
      const source = dir !== null ? this.plugin.model?.hubPathOf(dir) ?? dir : "/";
      void MarkdownRenderer.render(this.app, markdown, el, source, this);
    },
  };

  private wrapUpPending = false;
  private statusText: string | null = null;
  private showWrapUpSummaryAfterResult(): void {
    this.wrapUpPending = true;
  }

  private structureCheckText(): string {
    const graphReport = this.plugin.model?.validation().graphs.find((g) => g.path === (this.state.graphDir === "" ? "." : this.state.graphDir));
    return graphReport === undefined || graphReport.problems.length === 0
      ? "Structure check: clean."
      : "Structure check:\n" + graphReport.problems.map((p) => `[${p.kind}] ${p.note} — ${p.detail}`).join("\n");
  }

  private render(): void {
    if (this.root === null) return;
    if (this.state.graphDir === null) {
      this.root.render(<GraphPicker plugin={this.plugin} onPick={(dir) => { this.state.graphDir = dir; this.app.workspace.requestSaveLayout(); this.render(); }} />);
      return;
    }
    // Read the serialized leaf state, not leaf.view: a restored background tab
    // may still hold a DeferredView with no ChatView behind it.
    const duplicateTab = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).filter((leaf) => {
      if (leaf === this.leaf) return false;
      const s = leaf.getViewState().state as { graphDir?: string | null } | undefined;
      return (s?.graphDir ?? null) === this.state.graphDir;
    }).length > 0;
    this.root.render(
      <ChatSurface
        graphLabel={this.getDisplayText()}
        model={this.state.model}
        busy={this.busy}
        status={this.statusText}
        duplicateTab={duplicateTab}
        items={this.state.items}
        callbacks={this.callbacks}
      />,
    );
  }
}

export const WRAP_UP_MESSAGE = [
  "Wrap up this session now.",
  "Append one file to Log/, named Log/YYYY-MM-DD-<letter>.md — the letter carrying on from the last file present.",
  "Two or three sentences: what was established, where the thread stopped, any door I closed, anything you took out as your own invention.",
  "Then refresh the hub's ## Shape in the same breath. Do not ask a new question after wrapping up.",
].join(" ");

function GraphPicker({ plugin, onPick }: { plugin: CreativeBuddyPlugin; onPick: (dir: string) => void }): React.JSX.Element {
  const indexing = plugin.model === null;
  const graphs = plugin.model?.graphs() ?? [];
  return (
    <div className="cb-picker">
      <h3>Bind this tab to a graph</h3>
      {indexing ? (
        <p>Creative Buddy is still indexing the vault — the graphs will appear here in a moment.</p>
      ) : graphs.length === 0 ? (
        <p>No graphs found — a graph is a folder whose hub note carries a ## Charter heading.</p>
      ) : null}
      {graphs.map((dir) => (
        <button key={dir} onClick={() => onPick(dir)}>
          {dir === "" ? "(vault root)" : dir}
        </button>
      ))}
      <p className="cb-picker-hint">To start a brand-new graph, bind to the vault root and ask for a bootstrap — the interviewer asks the folder name first.</p>
    </div>
  );
}
