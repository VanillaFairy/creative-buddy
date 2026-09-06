import { ItemView, WorkspaceLeaf, Keymap, MarkdownRenderer, Notice, parseLinktext } from "obsidian";
import * as React from "react";
import { createRoot, Root } from "react-dom/client";
import type CreativeBuddyPlugin from "../main";
import { AgentService, SessionHandle } from "../agent/agent-service";
import { EffortLevel } from "../agent/effort";
import type { CreativeBuddySettings } from "../settings";
import { reduceTranscript, TranscriptEvent } from "./transcript";
import { ChatCallbacks, ChatPanel, ChatSurface, ChatTab, GraphPicker } from "./components";
import {
  ChatSession,
  SessionList,
  SessionSeed,
  activate,
  activeSession,
  addSession,
  closeSession,
  highestApprovalSeq,
  isPristine,
  openOn,
  replaceSession,
  restoreSessions,
  sharedGraphs,
} from "./sessions";
import { Outgoing, Queued, advance, cancelAll, msUntilSendable, remove, setCanceled } from "./queue";
import { restorePresetsOpen } from "./presets";
import { noteAnnouncement } from "./note-context";
import { noteLinktext } from "./links";
import { projectName, tabTitle } from "../view-title";
import { folderOffer, pickerHint, projectRows } from "../project-list";
import { resolveTarget, targetPathOf, vaultRelative } from "../agent/permissions";

/** What a new conversation in this panel starts as. */
function seedFrom(settings: CreativeBuddySettings): SessionSeed {
  return { model: settings.defaultModel, effort: settings.defaultEffort };
}

export const CHAT_VIEW_TYPE = "creative-buddy-chat";

/** Live state for one conversation. Never persisted — none of it survives a restart. */
interface Runtime {
  handle: SessionHandle | null;
  busy: boolean;
  status: string | null;
  approvalSeq: number;
  responders: Map<string, (allow: boolean, msg?: string) => void>;
  /** Typed during a turn and not yet said, plus whatever was taken back. */
  queue: Queued[];
  /**
   * The note this conversation has been told about, or undefined while nothing
   * has been said yet.
   *
   * The rule is that **a fresh process is told again**. A reload drops this whole
   * object, and a crash clears this field on the way past, so either way the next
   * message re-announces — even though both resume the same conversation and the
   * old line is still somewhere in its transcript. One line is cheaper than an
   * answer about the wrong note, and a session that has been resumed is exactly
   * the one whose context may have been compacted since.
   */
  announced: string | null | undefined;
  /**
   * Whether the turn in flight is one you stopped. The SDK reports an aborted
   * turn as an error, indistinguishable from one that failed, so the only
   * witness to the difference is the side that asked for the stop. Cleared at
   * the top of every send, so it can only ever describe the turn it was set in.
   */
  stopping: boolean;
  /** Pending wake-up for a message still inside its hold. See `wakeForQueue`. */
  holdTimer: number | null;
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
  /** Panel-wide, not per-tab: the row is part of the composer, and there is one. */
  private presetsShown = true;
  /** What the active tab's project has open, as of the last refresh. Drives the preset row. */
  private noteInView: { path: string; openQuestions: number } | null = null;
  private offModelChange: (() => void) | null = null;

  constructor(leaf: WorkspaceLeaf, private readonly plugin: CreativeBuddyPlugin) {
    super(leaf);
    this.list = restoreSessions(undefined, seedFrom(plugin.settings));
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
        effort: s.effort,
        sessionId: s.sessionId,
        items: s.items,
      })),
      active: this.list.active,
      presetsOpen: this.presetsShown,
    };
  }

  async setState(state: unknown, result: unknown): Promise<void> {
    this.presetsShown = restorePresetsOpen(state);
    const restored = restoreSessions(state, seedFrom(this.plugin.settings));
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
    this.register(
      this.plugin.onModelReady(() => {
        // A vault edit anywhere. Worth a repaint only when it moved the number the
        // preset row is drawn from — you answering a question in the editor, or the
        // interviewer closing one.
        this.offModelChange =
          this.plugin.model?.onChange(() => {
            if (this.refreshNoteContext()) this.render();
          }) ?? null;
        this.render();
      }),
    );
    this.registerEvent(this.app.workspace.on("layout-change", () => this.render()));
    // Which note you are reading, from both directions: another note in the same
    // pane, and another pane. Clicking into this panel does not change the active
    // *file*, so the note holds while you type about it.
    this.registerEvent(this.app.workspace.on("file-open", () => this.render()));
    this.registerEvent(this.app.workspace.on("active-leaf-change", () => this.render()));
    // One listener for the whole panel rather than per message: the transcript
    // re-renders constantly, and a listener attached to the container outlives
    // every block React swaps underneath it.
    this.registerDomEvent(this.contentEl, "click", (event) => this.openLink(event));
    this.render();
  }

  async onClose(): Promise<void> {
    this.offModelChange?.();
    for (const key of [...this.runtimes.keys()]) this.disposeRuntime(key);
    this.root?.unmount();
  }

  // ── per-conversation state ────────────────────────────────────────────────

  /** The clock is the shell's business; every pure module takes the day as an argument. */
  private today(): { y: number; m: number; d: number } {
    const now = new Date();
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() };
  }

  private runtime(key: string): Runtime {
    const existing = this.runtimes.get(key);
    if (existing !== undefined) return existing;
    const fresh: Runtime = {
      handle: null,
      busy: false,
      status: null,
      approvalSeq: 0,
      responders: new Map(),
      queue: [],
      announced: undefined,
      stopping: false,
      holdTimer: null,
    };
    this.runtimes.set(key, fresh);
    return fresh;
  }

  private disposeRuntime(key: string): void {
    const runtime = this.runtimes.get(key);
    if (runtime !== undefined) {
      if (runtime.holdTimer !== null) window.clearTimeout(runtime.holdTimer);
      runtime.handle?.dispose();
    }
    this.runtimes.delete(key);
  }

  /**
   * Come back when the front of the queue is allowed to leave.
   *
   * Nothing else would: a held message is waiting on the clock rather than on
   * the model, so no SDK event is coming to release it. One timer per
   * conversation, replaced rather than stacked, because only the front of the
   * queue is ever the next thing to go.
   */
  private wakeForQueue(key: string, runtime: Runtime, now: number): void {
    if (runtime.holdTimer !== null) window.clearTimeout(runtime.holdTimer);
    runtime.holdTimer = null;
    const due = msUntilSendable(runtime.queue, runtime.busy, now);
    if (due === null) return;
    runtime.holdTimer = window.setTimeout(() => {
      runtime.holdTimer = null;
      this.pump(key);
    }, due);
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

  /**
   * Recompute the note the active tab is looking at. Returns whether the answer
   * moved, which is what keeps a vault edit in some unrelated project from
   * repainting a conversation that has not changed.
   *
   * Called at the top of every render, so a tab switch, a restored panel and a
   * freshly picked project are all correct without any of them having to
   * remember to ask.
   */
  private refreshNoteContext(): boolean {
    const dir = activeSession(this.list).graphDir;
    const next = dir === null ? null : this.plugin.activeNoteIn(dir);
    const moved =
      next?.path !== this.noteInView?.path || next?.openQuestions !== this.noteInView?.openQuestions;
    this.noteInView = next;
    return moved;
  }

  // ── the tab strip ─────────────────────────────────────────────────────────

  private selectTab(index: number): void {
    this.list = activate(this.list, index);
    this.app.workspace.requestSaveLayout();
    this.render();
  }

  /**
   * The strip's "+": another conversation, on the project you are reading. It
   * always adds — asking for a new conversation while you already have one on
   * that project is the point of the button, and the ⚠ badge is there to say
   * both are writing to the same graph.
   */
  private newTab(): void {
    this.list = addSession(this.list, seedFrom(this.plugin.settings), this.plugin.activeGraphDir());
    this.app.workspace.requestSaveLayout();
    this.render();
  }

  /**
   * The ribbon's, the palette's and the note menu's way in: the conversation
   * about this project, or a new one when there is none. Pressing the icon
   * again is then a way back to the thread you already have rather than a
   * second one beside it.
   *
   * With nothing to resolve there is nothing to open: the panel is revealed and
   * whatever is on screen stays. A blank tab is already asking the question,
   * and another blank tab would not be an answer.
   */
  openConversation(graphDir: string | null): void {
    const next = graphDir === null ? this.list : openOn(this.list, graphDir, seedFrom(this.plugin.settings));
    if (next !== this.list) {
      this.list = next;
      this.app.workspace.requestSaveLayout();
    }
    this.render();
  }

  /**
   * The palette's "New conversation" — the same thing the strip's "+" does, on
   * the project you are reading, except that a blank conversation already on
   * screen *is* a new conversation and gets the project rather than a tab beside
   * it. The picker is left to ask only when nothing resolved.
   */
  newConversation(): void {
    const current = activeSession(this.list);
    if (!isPristine(current)) {
      this.newTab();
      return;
    }
    const graphDir = this.plugin.activeGraphDir();
    if (graphDir === null) this.render();
    else this.patch(current.key, { graphDir });
  }

  /**
   * Give the folder you are reading a charter, then bind this tab to it. The
   * write has to land before the bind: a tab pointed at a dir `graphs()` does
   * not carry is exactly what the graph list exists to prevent. A failed write
   * has already said so in a notice, and leaves the picker as it was.
   */
  private async adopt(key: string, dir: string): Promise<void> {
    if (await this.plugin.createProjectFrom(dir)) this.patch(key, { graphDir: dir });
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
    const today = this.today();
    const todayIso = `${today.y}-${String(today.m).padStart(2, "0")}-${String(today.d).padStart(2, "0")}`;
    const key = session.key;

    try {
      runtime.handle = this.service.start(
        {
          vaultRoot: this.plugin.vaultRootPath().replace(/\\/g, "/"),
          graphDir,
          hubPath: model.hubPathOf(graphDir),
          model: session.model,
          effort: session.effort,
          claudePath,
          todayIso,
          stats,
          problems: model.problemsOf(graphDir),
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
            // Consumed here rather than cleared on the next send: with the queue
            // no longer taken back by a stop, the message behind a stopped turn
            // can go out before its result lands, and clearing on the way past
            // would leave the stop reported as a failure.
            const stopped = runtime.stopping;
            runtime.stopping = false;
            this.dispatch(key, {
              type: "result",
              costUsd: result.totalCostUsd,
              stopped,
              isError: result.isError,
              resultText: result.resultText,
            });
            // Last, so the next message lands under this turn's rule rather
            // than ahead of it.
            this.pump(key);
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
            // Anything waiting was riding on the process that just died. It is
            // taken back rather than quietly restarting claude.exe to spend on
            // messages you queued against a session that no longer exists.
            runtime.queue = cancelAll(runtime.queue);
            // No result is coming to consume it — the turn it described died
            // with the process, and it must not describe the next one.
            runtime.stopping = false;
            // The next send is a fresh process, so it gets told which note you are
            // on again — the same rule a reload follows, for the same reason.
            runtime.announced = undefined;
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

  /**
   * One move of the outbox: line the typed message up, then hand the front of
   * the queue to the agent if the conversation is free. Sending, a turn ending
   * and a reconnect are all this same call — see `queue.ts` for why.
   *
   * The transcript is written here rather than where you pressed Enter, so it
   * keeps saying what was actually said: a queued message is recorded at the
   * moment it goes out, not at the moment you committed to it.
   */
  private pump(key: string, message?: Outgoing): void {
    // Ahead of runtime(), which would otherwise mint live state for a tab that
    // closed while its turn was still running.
    const session = this.list.sessions.find((s) => s.key === key);
    if (session === undefined) return;
    const runtime = this.runtime(key);
    const now = Date.now();
    const step = advance(runtime.queue, runtime.busy, now, message);
    runtime.queue = step.queue;
    if (step.send === null) {
      this.wakeForQueue(key, runtime, now);
      this.render();
      return;
    }
    const handle = this.ensureSession(session);
    if (handle === null) {
      // Nothing to send it down — ensureSession has already said why in a
      // Notice. The message goes back on screen as canceled rather than
      // disappearing between the queue and the transcript, keeping its name so
      // a preset does not turn back into its paragraph on the way.
      runtime.queue = [{ ...step.send, canceled: true, at: now }, ...runtime.queue];
      this.render();
      return;
    }
    runtime.busy = true;
    this.dispatch(key, { type: "user-sent", text: step.send.text, label: step.send.label });
    // The transcript keeps what was said; the note line is plumbing that rides
    // along with it, like the session preamble, and is not part of the record.
    const note = step.send.note ?? null;
    const line = noteAnnouncement(note, runtime.announced);
    if (line !== null) runtime.announced = note;
    handle.sendUserMessage(line === null ? step.send.text : `${line}\n\n${step.send.text}`);
  }

  /** Every control belongs to the conversation on screen. */
  private readonly callbacks: ChatCallbacks = {
    onSend: (message: Outgoing): void => {
      // Stamped here rather than at the point it goes out, so a message queued
      // behind a running turn still means the note you wrote it about — one place
      // for it, so a preset and something you typed cannot come to mean different
      // things.
      this.refreshNoteContext();
      const note = this.noteInView?.path;
      this.pump(activeSession(this.list).key, note === undefined ? message : { ...message, note });
    },
    onModelChange: (model: string): void => {
      const session = activeSession(this.list);
      this.patch(session.key, { model });
      this.runtime(session.key)
        .handle?.setModel(model)
        .catch(() => new Notice("Model switch failed — the session keeps its current model."));
    },
    onEffortChange: (effort: EffortLevel): void => {
      const session = activeSession(this.list);
      this.patch(session.key, { effort });
      this.runtime(session.key)
        .handle?.setEffort(effort)
        .catch(() => new Notice("Effort switch failed — the session keeps its current level."));
    },
    onApprove: (id: string, allow: boolean, message?: string): void => {
      const session = activeSession(this.list);
      const runtime = this.runtime(session.key);
      runtime.responders.get(id)?.(allow, message);
      runtime.responders.delete(id);
      this.dispatch(session.key, { type: "approval-resolved", id, allowed: allow });
    },
    onInterrupt: (): void => {
      const session = activeSession(this.list);
      const runtime = this.runtime(session.key);
      runtime.handle?.interrupt().catch(() => undefined);
      runtime.busy = false;
      // So the turn's own rule can say you stopped it rather than reporting the
      // abort the SDK is about to flag as a failure.
      runtime.stopping = true;
      // Stopping is about this turn and only this turn. What is lined up behind
      // it was queued deliberately and goes out as it always would — the bin on
      // each row is how you change your mind about one of those. Not pumped
      // here: the stopped turn's own result is what releases the next message,
      // so the rule saying you stopped this one is written before it goes.
      this.render();
    },
    onQueuedCanceled: (index: number, canceled: boolean): void => {
      const key = activeSession(this.list).key;
      const runtime = this.runtime(key);
      runtime.queue = setCanceled(runtime.queue, index, canceled);
      // Putting one back in line is itself a send: it goes out now if nothing
      // is running, and waits its turn like anything else if something is.
      // Taking one back can free the message behind it, so both ways pump.
      this.pump(key);
    },
    onQueuedDeleted: (index: number): void => {
      const key = activeSession(this.list).key;
      const runtime = this.runtime(key);
      runtime.queue = remove(runtime.queue, index);
      // Nothing survives this: a message that never went out has no transcript
      // row, is not in the saved workspace, and was never said to the model.
      this.pump(key);
    },
    onPresetsToggle: (open: boolean): void => {
      this.presetsShown = open;
      this.app.workspace.requestSaveLayout();
      this.render();
    },
    renderMarkdown: (el: HTMLElement, markdown: string): void => {
      void MarkdownRenderer.render(this.app, markdown, el, this.sourcePath(), this);
    },
  };

  // ── links out of the transcript ───────────────────────────────────────────

  /**
   * What a link in a message is relative to. Link resolution is done from a
   * NOTE, so this is the graph's hub note rather than the graph folder — and
   * the same answer has to serve both the renderer and the click, or a click
   * could resolve a name differently from the way it was drawn.
   */
  private sourcePath(): string {
    const dir = activeSession(this.list).graphDir;
    return dir !== null ? this.plugin.model?.hubPathOf(dir) ?? dir : "/";
  }

  /**
   * `MarkdownRenderer.render` draws the anchors and leaves them inert —
   * Obsidian only wires link clicks inside containers it registered itself, and
   * a plugin's own div is never one. So the panel opens its own links.
   *
   * A missing note says so instead of being created: the transcript is
   * something said about the graph, and a click on a name the interviewer got
   * wrong should not add a note to the vault.
   */
  private openLink(event: MouseEvent): void {
    const anchor = (event.target as HTMLElement | null)?.closest("a") ?? null;
    if (anchor === null) return;
    const linktext = noteLinktext(anchor);
    if (linktext === null) return;
    event.preventDefault();
    const source = this.sourcePath();
    const { path } = parseLinktext(linktext);
    if (this.app.metadataCache.getFirstLinkpathDest(path, source) === null) {
      new Notice(`No note called "${path}" in this vault.`);
      return;
    }
    // A plain click is false → the main pane you last worked in, the way the
    // map opens notes. isModEvent keeps ctrl for a tab and ctrl-alt for a
    // split, so the modifiers mean here what they mean everywhere else.
    void this.app.workspace.openLinkText(linktext, source, Keymap.isModEvent(event));
  }

  private render(): void {
    if (this.root === null) return;
    this.refreshNoteContext();
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
    const projects = this.plugin.model === null ? [] : projectRows(this.plugin.model);
    const offer =
      this.plugin.model === null ? null : folderOffer(this.plugin.model, this.plugin.activeFolderDir());

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
            question="Which project are we working on?"
            hint={pickerHint(projects, offer)}
            indexing={this.plugin.model === null}
            projects={projects}
            offer={offer}
            onPick={(dir) => this.patch(session.key, { graphDir: dir })}
            onAdopt={(dir) => void this.adopt(session.key, dir)}
          />
        ) : (
          <ChatSurface
            model={session.model}
            effort={session.effort}
            busy={runtime.busy}
            status={runtime.status}
            items={session.items}
            queued={runtime.queue}
            presetsOpen={this.presetsShown}
            openQuestions={this.noteInView?.openQuestions ?? 0}
            callbacks={this.callbacks}
          />
        )}
      </ChatPanel>,
    );
  }
}
