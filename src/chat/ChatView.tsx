import { ItemView, WorkspaceLeaf, MarkdownRenderer, Notice } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import type CreativeBuddyPlugin from "../main";
import { AgentService, SessionHandle } from "../agent/agent-service";
import { reduceTranscript, TranscriptEvent } from "./transcript";
import { ChatCallbacks, ChatPanel, ChatSurface, ChatTab, GraphPicker } from "./components";
import {
  ChatSession,
  SessionList,
  activate,
  activeSession,
  addSession,
  closeSession,
  highestApprovalSeq,
  isPristine,
  replaceSession,
  restoreSessions,
  sharedGraphs,
} from "./sessions";
import { projectName, tabTitle } from "../view-title";
import { resolveTarget, targetPathOf, vaultRelative } from "../agent/permissions";

export const CHAT_VIEW_TYPE = "creative-buddy-chat";

/** Live state for one conversation. Never persisted — none of it survives a restart. */
interface Runtime {
  handle: SessionHandle | null;
  busy: boolean;
  status: string | null;
  wrapUpPending: boolean;
  approvalSeq: number;
  responders: Map<string, (allow: boolean, msg?: string) => void>;
}

/**
 * One panel, several conversations behind a tab strip. A tab is a Claude
 * session, so everything live is per-tab and keyed on the session's key —
 * indices shift when a tab closes, and an in-flight turn must not land in
 * whichever conversation happens to sit at its old index.
 */
export class ChatView extends ItemView {
  private root: Root | null = null;
  private list: SessionList;
  private service = new AgentService();
  private runtimes = new Map<string, Runtime>();

  constructor(leaf: WorkspaceLeaf, private readonly plugin: CreativeBuddyPlugin) {
    super(leaf);
    this.list = restoreSessions(undefined, plugin.settings.defaultModel);
  }

  getViewType(): string { return CHAT_VIEW_TYPE; }
  getDisplayText(): string {
    return tabTitle("Creative buddy chat", activeSession(this.list).graphDir, this.app.vault.getName());
  }
  getIcon(): string { return "messages-square"; }

  getState(): Record<string, unknown> {
    return {
      sessions: this.list.sessions.map((s) => ({
        key: s.key,
        graphDir: s.graphDir,
        model: s.model,
        sessionId: s.sessionId,
        items: s.items,
      })),
      active: this.list.active,
    };
  }

  async setState(state: unknown, result: unknown): Promise<void> {
    const restored = restoreSessions(state, this.plugin.settings.defaultModel);
    // Drop anything live whose conversation this state does not contain, or
    // which was rebound to another graph — a handle outliving its graph would
    // go on writing into the old one.
    const byKey = new Map(restored.sessions.map((s) => [s.key, s]));
    for (const key of [...this.runtimes.keys()]) {
      const before = this.list.sessions.find((s) => s.key === key);
      const after = byKey.get(key);
      if (after === undefined || after.graphDir !== (before?.graphDir ?? null)) this.disposeRuntime(key);
    }
    this.list = restored;
    for (const session of this.list.sessions) {
      this.runtime(session.key).approvalSeq = highestApprovalSeq(session.items);
    }
    this.render();
    await super.setState(state as never, result as never);
  }

  async onOpen(): Promise<void> {
    this.root = createRoot(this.contentEl);
    // Wake the graph picker when indexing finishes, and recompute the shared
    // badges whenever the workspace layout shifts.
    this.register(this.plugin.onModelReady(() => this.render()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.render()));
    this.render();
  }

  async onClose(): Promise<void> {
    for (const key of [...this.runtimes.keys()]) this.disposeRuntime(key);
    this.root?.unmount();
  }

  // ── per-conversation state ────────────────────────────────────────────────

  private runtime(key: string): Runtime {
    const existing = this.runtimes.get(key);
    if (existing !== undefined) return existing;
    const fresh: Runtime = {
      handle: null,
      busy: false,
      status: null,
      wrapUpPending: false,
      approvalSeq: 0,
      responders: new Map(),
    };
    this.runtimes.set(key, fresh);
    return fresh;
  }

  private disposeRuntime(key: string): void {
    this.runtimes.get(key)?.handle?.dispose();
    this.runtimes.delete(key);
  }

  /** Silently drops events for a conversation whose tab closed mid-turn. */
  private dispatch(key: string, event: TranscriptEvent): void {
    const session = this.list.sessions.find((s) => s.key === key);
    if (session === undefined) return;
    this.patch(key, { items: reduceTranscript(session.items, event, Date.now()) });
  }

  private patch(key: string, changes: Partial<ChatSession>): void {
    const session = this.list.sessions.find((s) => s.key === key);
    if (session === undefined) return;
    this.list = replaceSession(this.list, key, { ...session, ...changes });
    this.app.workspace.requestSaveLayout();
    this.render();
  }

  // ── the tab strip ─────────────────────────────────────────────────────────

  private selectTab(index: number): void {
    this.list = activate(this.list, index);
    this.app.workspace.requestSaveLayout();
    this.render();
  }

  private newTab(): void {
    this.list = addSession(this.list, this.plugin.settings.defaultModel);
    this.app.workspace.requestSaveLayout();
    this.render();
  }

  /**
   * The command's entry point. Unlike the strip's "+", which is an explicit
   * click and always adds, this is reached by asking for a fresh conversation
   * — and if the panel it just revealed is already sitting on an unused one,
   * that is the fresh conversation.
   */
  newConversation(): void {
    if (isPristine(activeSession(this.list))) {
      this.render();
      return;
    }
    this.newTab();
  }

  private closeTab(index: number): void {
    const doomed = this.list.sessions[index];
    const next = closeSession(this.list, index);
    if (next === this.list) return; // the last conversation stays
    if (doomed !== undefined) this.disposeRuntime(doomed.key);
    this.list = next;
    this.app.workspace.requestSaveLayout();
    this.render();
  }

  /**
   * Graphs bound by more than one conversation anywhere. Reads other panels'
   * serialized state rather than leaf.view: a restored background tab may
   * still hold a DeferredView with no ChatView behind it.
   */
  private sharedSet(): Set<string> {
    const panels: Array<Array<string | null>> = [this.list.sessions.map((s) => s.graphDir)];
    for (const leaf of this.app.workspace.getLeavesOfType(CHAT_VIEW_TYPE)) {
      if (leaf === this.leaf) continue;
      const state = leaf.getViewState().state as
        | { sessions?: Array<{ graphDir?: string | null } | null>; graphDir?: string | null }
        | undefined;
      const sessions = state?.sessions;
      // A panel saved before the tab strip existed kept its one graph at the top.
      if (Array.isArray(sessions)) panels.push(sessions.map((s) => s?.graphDir ?? null));
      else panels.push([state?.graphDir ?? null]);
    }
    return sharedGraphs(panels);
  }

  // ── the agent ─────────────────────────────────────────────────────────────

  /**
   * Whether the tool's target is already a note, asked at dispatch time —
   * before the write lands. The agent re-writes whole existing notes, so the
   * tool name says nothing about whether this is an addition or an update.
   */
  private targetExists(name: string, input: Record<string, unknown>): boolean {
    const target = targetPathOf(name, input);
    if (target === null) return false;
    const vaultRoot = this.plugin.vaultRootPath().replace(/\\/g, "/");
    const rel = vaultRelative(vaultRoot, resolveTarget(vaultRoot, target));
    return rel !== null && this.app.vault.getAbstractFileByPath(rel) !== null;
  }

  private ensureSession(session: ChatSession): SessionHandle | null {
    const runtime = this.runtime(session.key);
    if (runtime.handle !== null) return runtime.handle;
    const model = this.plugin.model;
    const claudePath = this.plugin.resolveClaudePath();
    if (session.graphDir === null) return null;
    if (model === null) {
      new Notice("Creative Buddy is still indexing the vault — try again in a moment.");
      return null;
    }
    if (claudePath === null) {
      new Notice("Claude Code executable not found — set it in Creative Buddy settings.");
      return null;
    }
    const graphDir = session.graphDir;
    const stats = model.stats(graphDir);
    if (stats === null) {
      new Notice("This graph's hub note is gone — rebind the tab.");
      return null;
    }
    const today = new Date();
    const todayIso = `${today.getFullYear()}-${String(today.getMonth() + 1).padStart(2, "0")}-${String(today.getDate()).padStart(2, "0")}`;
    const key = session.key;

    try {
      runtime.handle = this.service.start(
        {
          vaultRoot: this.plugin.vaultRootPath().replace(/\\/g, "/"),
          graphDir,
          hubPath: model.hubPathOf(graphDir),
          model: session.model,
          claudePath,
          todayIso,
          stats,
          apiKeyOverride: this.plugin.settings.apiKeyOverride === "" ? undefined : this.plugin.settings.apiKeyOverride,
          resumeSessionId: session.sessionId ?? undefined,
        },
        {
          onInit: (info) => this.patch(key, { sessionId: info.sessionId }),
          onTextDelta: (text) => this.dispatch(key, { type: "text-delta", text }),
          onAssistantText: (text) => this.dispatch(key, { type: "assistant-final", text }),
          onToolUse: (use) =>
            this.dispatch(key, {
              type: "tool-use",
              id: use.id,
              name: use.name,
              input: use.input,
              subagent: use.subagent,
              existed: this.targetExists(use.name, use.input),
            }),
          onToolResult: (r) => this.dispatch(key, { type: "tool-result", toolUseId: r.toolUseId }),
          onApproval: (request) => {
            const id = `a${++runtime.approvalSeq}`;
            runtime.responders.set(id, request.respond);
            this.dispatch(key, {
              type: "approval",
              id,
              toolName: request.toolName,
              targetPath: request.targetPath,
              reason: request.reason,
              title: request.title,
            });
          },
          onResult: (result) => {
            runtime.busy = false;
            this.dispatch(key, { type: "result", costUsd: result.totalCostUsd, isError: result.isError });
            if (runtime.wrapUpPending) {
              runtime.wrapUpPending = false;
              this.dispatch(key, { type: "notice", text: this.structureCheckText(graphDir) });
            }
          },
          onStatus: (status) => {
            runtime.status = status;
            this.render();
          },
          onError: (error) => this.dispatch(key, { type: "error", message: error.message }),
          onEnd: () => {
            // claude.exe exited. Dispose the dead handle (settles any approval
            // card left pending by a mid-approval crash), then drop it so the
            // next send starts a fresh process resuming the same conversation.
            runtime.handle?.dispose();
            runtime.handle = null;
            runtime.busy = false;
            // The SDK side was told "deny" for anything still pending; the cards
            // must agree, or a click on a stale Allow would record a lie.
            const current = this.list.sessions.find((s) => s.key === key);
            if (current !== undefined) {
              let items = current.items;
              for (const id of runtime.responders.keys()) {
                items = reduceTranscript(items, { type: "approval-resolved", id, allowed: false }, Date.now());
              }
              this.list = replaceSession(this.list, key, { ...current, items });
            }
            runtime.responders.clear();
            this.dispatch(key, { type: "notice", text: "The session ended. Your next message reconnects to the same conversation." });
          },
          onStderr: (line) => console.debug("[creative-buddy] claude:", line),
        },
      );
    } catch {
      runtime.handle = null; // onError already put the failure in the transcript
    }
    return runtime.handle;
  }

  /** Every control belongs to the conversation on screen. */
  private readonly callbacks: ChatCallbacks = {
    onSend: (text: string): void => {
      const session = activeSession(this.list);
      const handle = this.ensureSession(session);
      if (handle === null) return;
      this.runtime(session.key).busy = true;
      this.dispatch(session.key, { type: "user-sent", text });
      handle.sendUserMessage(text);
    },
    onModelChange: (model: string): void => {
      const session = activeSession(this.list);
      this.patch(session.key, { model });
      this.runtime(session.key)
        .handle?.setModel(model)
        .catch(() => new Notice("Model switch failed — the session keeps its current model."));
    },
    onApprove: (id: string, allow: boolean, message?: string): void => {
      const session = activeSession(this.list);
      const runtime = this.runtime(session.key);
      runtime.responders.get(id)?.(allow, message);
      runtime.responders.delete(id);
      this.dispatch(session.key, { type: "approval-resolved", id, allowed: allow });
    },
    onWrapUp: (): void => {
      const session = activeSession(this.list);
      const handle = this.ensureSession(session);
      if (handle === null) return;
      const runtime = this.runtime(session.key);
      runtime.busy = true;
      // The structure-check summary is appended once the turn's result lands.
      runtime.wrapUpPending = true;
      this.dispatch(session.key, { type: "user-sent", text: "(wrap up)" });
      handle.sendUserMessage(WRAP_UP_MESSAGE);
    },
    onInterrupt: (): void => {
      const session = activeSession(this.list);
      const runtime = this.runtime(session.key);
      runtime.handle?.interrupt().catch(() => undefined);
      runtime.busy = false;
      this.render();
    },
    renderMarkdown: (el: HTMLElement, markdown: string): void => {
      // Relative links resolve against a NOTE path, so hand the renderer the
      // hub note rather than the graph folder.
      const dir = activeSession(this.list).graphDir;
      const source = dir !== null ? this.plugin.model?.hubPathOf(dir) ?? dir : "/";
      void MarkdownRenderer.render(this.app, markdown, el, source, this);
    },
  };

  private structureCheckText(graphDir: string): string {
    const graphReport = this.plugin.model?.validation().graphs.find((g) => g.path === (graphDir === "" ? "." : graphDir));
    return graphReport === undefined || graphReport.problems.length === 0
      ? "Structure check: clean."
      : "Structure check:\n" + graphReport.problems.map((p) => `[${p.kind}] ${p.note} — ${p.detail}`).join("\n");
  }

  private render(): void {
    if (this.root === null) return;
    const shared = this.sharedSet();
    const vaultName = this.app.vault.getName();
    const tabs: ChatTab[] = this.list.sessions.map((session) => ({
      key: session.key,
      label: projectName(session.graphDir, vaultName) ?? "New chat",
      shared: session.graphDir !== null && shared.has(session.graphDir),
      busy: this.runtimes.get(session.key)?.busy === true,
    }));
    const session = activeSession(this.list);
    const runtime = this.runtime(session.key);

    this.root.render(
      <ChatPanel
        tabs={tabs}
        active={this.list.active}
        onSelectTab={(index) => this.selectTab(index)}
        onCloseTab={(index) => this.closeTab(index)}
        onNewTab={() => this.newTab()}
      >
        {session.graphDir === null ? (
          <GraphPicker
            indexing={this.plugin.model === null}
            graphs={this.plugin.model?.graphs() ?? []}
            onPick={(dir) => this.patch(session.key, { graphDir: dir })}
          />
        ) : (
          <ChatSurface
            model={session.model}
            busy={runtime.busy}
            status={runtime.status}
            items={session.items}
            callbacks={this.callbacks}
          />
        )}
      </ChatPanel>,
    );
  }
}

export const WRAP_UP_MESSAGE = [
  "Wrap up this session now.",
  "Append one file to Log/, named Log/YYYY-MM-DD-<letter>.md — the letter carrying on from the last file present.",
  "Two or three sentences: what was established, where the thread stopped, any door I closed, anything you took out as your own invention.",
  "Then refresh the hub's ## Shape in the same breath. Do not ask a new question after wrapping up.",
].join(" ");
