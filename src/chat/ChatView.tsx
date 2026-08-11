import { ItemView, WorkspaceLeaf, MarkdownRenderer, Notice } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import type GraphBuddyPlugin from "../main";
import { AgentService, SessionHandle } from "../agent/agent-service";
import { renderDigestForGraph } from "../agent/digest";
import { reduceTranscript, TranscriptItem, TranscriptEvent } from "./transcript";
import { ChatSurface } from "./components";
import { baseName, VaultView } from "../graph/types";
import { hubPath as graphHubPath } from "../graph/discovery";

export const CHAT_VIEW_TYPE = "graph-buddy-chat";

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

  constructor(leaf: WorkspaceLeaf, private readonly plugin: GraphBuddyPlugin) {
    super(leaf);
    this.state = { graphDir: null, model: plugin.settings.defaultModel, sessionId: null, items: [] };
  }

  getViewType(): string { return CHAT_VIEW_TYPE; }
  getDisplayText(): string {
    return this.state.graphDir === null ? "Graph chat" : `Chat: ${this.state.graphDir === "" ? this.app.vault.getName() : baseName(this.state.graphDir)}`;
  }
  getIcon(): string { return "messages-square"; }

  getState(): Record<string, unknown> {
    return { graphDir: this.state.graphDir, model: this.state.model, sessionId: this.state.sessionId, items: this.state.items };
  }

  async setState(state: unknown, result: unknown): Promise<void> {
    const s = (state ?? {}) as Partial<ChatState>;
    this.state = {
      graphDir: s.graphDir ?? null,
      model: s.model ?? this.plugin.settings.defaultModel,
      sessionId: s.sessionId ?? null,
      items: s.items ?? [],
    };
    this.render();
    await super.setState(state as never, result as never);
  }

  async onOpen(): Promise<void> {
    this.root = createRoot(this.contentEl);
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
    if (this.state.graphDir === null || model === null) return null;
    if (claudePath === null) {
      new Notice("Claude Code executable not found — set it in Graph Buddy settings.");
      return null;
    }
    const graphDir = this.state.graphDir;
    const stats = model.stats(graphDir);
    if (stats === null) {
      new Notice("This graph's hub note is gone — rebind the tab.");
      return null;
    }
    const view = new VaultView({ rootName: this.app.vault.getName(), files: model.snapshotFiles() });
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const report = model.obligations({ y: today.getFullYear(), m: today.getMonth() + 1, d: today.getDate() });

    this.session = this.service.start(
      {
        vaultRoot: this.plugin.vaultRootPath().replace(/\\/g, "/"),
        graphDir,
        hubPath: graphHubPath(view, graphDir),
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
        onToolUse: (use) => this.dispatch({ type: "tool-use", id: use.id, name: use.name, input: use.input }),
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
        },
        onError: (error) => this.dispatch({ type: "error", message: error.message }),
      },
    );
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
      void this.session?.setModel(model);
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
      void this.session?.interrupt();
      this.busy = false;
      this.render();
    },
    renderMarkdown: (el: HTMLElement, markdown: string): void => {
      void MarkdownRenderer.render(this.app, markdown, el, this.state.graphDir ?? "/", this);
    },
  };

  private wrapUpPending = false;
  private showWrapUpSummaryAfterResult(): void {
    this.wrapUpPending = true;
  }

  private render(): void {
    if (this.root === null) return;
    if (this.state.graphDir === null) {
      this.root.render(<GraphPicker plugin={this.plugin} onPick={(dir) => { this.state.graphDir = dir; this.app.workspace.requestSaveLayout(); this.render(); }} />);
      return;
    }
    if (this.wrapUpPending && !this.busy) {
      this.wrapUpPending = false;
      const graphReport = this.plugin.model?.validation().graphs.find((g) => g.path === (this.state.graphDir === "" ? "." : this.state.graphDir));
      const text = graphReport === undefined || graphReport.problems.length === 0
        ? "Structure check: clean."
        : "Structure check:\n" + graphReport.problems.map((p) => `[${p.kind}] ${p.note} — ${p.detail}`).join("\n");
      this.state.items = reduceTranscript(this.state.items, { type: "notice", text });
    }
    const duplicateTab = this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE).filter((leaf) => {
      const view = leaf.view as ChatView;
      return view !== this && view.state?.graphDir === this.state.graphDir;
    }).length > 0;
    this.root.render(
      <ChatSurface
        graphLabel={this.getDisplayText()}
        model={this.state.model}
        busy={this.busy}
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

function GraphPicker({ plugin, onPick }: { plugin: GraphBuddyPlugin; onPick: (dir: string) => void }): React.JSX.Element {
  const graphs = plugin.model?.graphs() ?? [];
  return (
    <div className="gb-picker">
      <h3>Bind this tab to a graph</h3>
      {graphs.length === 0 ? <p>No graphs found — a graph is a folder whose hub note carries a ## Charter heading.</p> : null}
      {graphs.map((dir) => (
        <button key={dir} onClick={() => onPick(dir)}>
          {dir === "" ? "(vault root)" : dir}
        </button>
      ))}
      <p className="gb-picker-hint">To start a brand-new graph, bind to the vault root and ask for a bootstrap — the interviewer asks the folder name first.</p>
    </div>
  );
}
