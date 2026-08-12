import * as React from "react";
import { TranscriptItem } from "./transcript";
import { groupActivity, groupTitle, ActivityGroup, ActivityItem } from "./activity-groups";
import { MODEL_CHOICES } from "../settings";
import { PICKER_EMPTY, PICKER_INDEXING, ProjectRow, noteCount, projectRowLabel } from "../project-list";

export interface ChatCallbacks {
  onSend(text: string): void;
  onModelChange(model: string): void;
  onApprove(id: string, allow: boolean, message?: string): void;
  onWrapUp(): void;
  onInterrupt(): void;
  renderMarkdown(el: HTMLElement, markdown: string): void;
}

export interface ChatTab {
  key: string;
  label: string;
  /** Another conversation is bound to the same graph — last write wins. */
  shared: boolean;
  busy: boolean;
}

/**
 * The panel: one tab strip over one conversation. A tab is a Claude session,
 * so the strip is the only place sessions are made or ended.
 */
export function ChatPanel(props: {
  tabs: ChatTab[];
  active: number;
  onSelectTab(index: number): void;
  onCloseTab(index: number): void;
  onNewTab(): void;
  children: React.ReactNode;
}): React.JSX.Element {
  return (
    <div className="cb-panel">
      <div className="cb-tabs">
        {/* The tabs scroll, the "+" does not — an action that leaves the panel
            when you open enough conversations is not an action. */}
        <div className="cb-tabs-scroll" role="tablist">
        {props.tabs.map((tab, i) => (
          <div key={tab.key} className={`cb-tab${i === props.active ? " cb-tab-active" : ""}`}>
            <button
              className="cb-tab-pick"
              role="tab"
              aria-selected={i === props.active}
              onClick={() => props.onSelectTab(i)}
            >
              {tab.busy ? <span className="cb-tab-busy" aria-label="working" /> : null}
              <span className="cb-tab-label">{tab.label}</span>
              {tab.shared ? (
                <span className="cb-tab-shared" title="Another conversation is bound to this graph — last write wins.">⚠</span>
              ) : null}
            </button>
            {/* No close on the last tab: a panel always holds one conversation. */}
            {props.tabs.length > 1 ? (
              <button className="cb-tab-close" aria-label={`Close ${tab.label}`} onClick={() => props.onCloseTab(i)}>
                ×
              </button>
            ) : null}
          </div>
        ))}
        </div>
        <button className="cb-tab-new" aria-label="New conversation" title="New conversation" onClick={props.onNewTab}>
          +
        </button>
      </div>
      {props.children}
    </div>
  );
}

export function ChatSurface(props: {
  model: string;
  busy: boolean;
  status: string | null;
  items: TranscriptItem[];
  callbacks: ChatCallbacks;
}): React.JSX.Element {
  const { callbacks } = props;
  const [draft, setDraft] = React.useState("");
  const listRef = React.useRef<HTMLDivElement>(null);

  React.useEffect(() => {
    const list = listRef.current;
    if (list !== null) list.scrollTo({ top: list.scrollHeight });
  }, [props.items]);

  const send = (): void => {
    const text = draft.trim();
    if (text === "" || props.busy) return;
    setDraft("");
    callbacks.onSend(text);
  };

  return (
    <div className="cb-chat">
      <header className="cb-chat-header">
        <div className="cb-chat-controls">
          {props.busy ? <span className="cb-chat-status">{props.status ?? "thinking…"}</span> : null}
          <select className="cb-quiet-control" value={props.model} onChange={(e) => callbacks.onModelChange(e.target.value)}>
            {Object.entries(MODEL_CHOICES).map(([id, label]) => (
              <option key={id} value={id}>{label}</option>
            ))}
          </select>
          {/* One slot, one button: a disabled "Wrap up" during a turn is a
              control you cannot use sitting next to the one you want. */}
          {props.busy
            ? <button className="cb-quiet-control" onClick={() => callbacks.onInterrupt()}>Stop</button>
            : <button className="cb-quiet-control" onClick={() => callbacks.onWrapUp()}>Wrap up</button>}
        </div>
      </header>
      <div className="cb-chat-list" ref={listRef}>
        {props.items.length === 0 ? (
          <p className="cb-chat-empty">
            Nothing said yet. Tell the interviewer what you are working on — it asks one question at a
            time and files your answers into the graph as it goes.
          </p>
        ) : null}
        {groupActivity(props.items, props.busy).map((row) =>
          row.kind === "group"
            ? <ActivityPanel key={row.key} row={row} />
            : <TranscriptRow key={row.key} item={row.item} callbacks={callbacks} />,
        )}
      </div>
      <div className="cb-chat-composer">
        <textarea
          value={draft}
          placeholder="Say something to the interviewer — Enter sends"
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
        />
        <button onClick={send} disabled={props.busy || draft.trim() === ""}>Send</button>
      </div>
    </div>
  );
}

/**
 * The resting state of a view that does not know which project it is for. Rows
 * carry each project's size and where it sits, so choosing is a reading rather
 * than a guess at a folder path.
 *
 * The map draws its own copy of this in plain DOM (see MindmapView.drawPicker)
 * — the two share these class names and `projectRows`, which is where the
 * decisions live. Keep the markup in step.
 */
export function GraphPicker(props: {
  question: string;
  indexing: boolean;
  projects: ProjectRow[];
  hint?: string;
  onPick(dir: string): void;
}): React.JSX.Element {
  return (
    <div className="cb-picker">
      <h3 className="cb-picker-question">{props.question}</h3>
      {props.indexing ? (
        <p>{PICKER_INDEXING}</p>
      ) : props.projects.length === 0 ? (
        <p>{PICKER_EMPTY}</p>
      ) : (
        <div className="cb-picker-graphs">
          {props.projects.map((row) => (
            <button
              className="cb-picker-graph"
              key={row.dir}
              aria-label={projectRowLabel(row)}
              onClick={() => props.onPick(row.dir)}
            >
              <span className="cb-picker-name">{row.name}</span>
              {row.location !== null ? <span className="cb-picker-where">{row.location}</span> : null}
              <span className="cb-picker-state" aria-hidden="true">
                <span>{noteCount(row.notes)}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {props.hint !== undefined ? <p className="cb-picker-hint">{props.hint}</p> : null}
    </div>
  );
}

function TranscriptRow({ item, callbacks }: { item: ActivityItem; callbacks: ChatCallbacks }): React.JSX.Element {
  switch (item.kind) {
    case "user":
      return <div className="cb-msg cb-msg-user">{item.text}</div>;
    case "assistant":
      return <MarkdownBlock markdown={item.markdown} streaming={item.streaming} render={callbacks.renderMarkdown} />;
    case "approval":
      return <ApprovalCard item={item} callbacks={callbacks} />;
    case "notice":
      return <div className={`cb-notice cb-notice-${item.tone}`}>{item.text}</div>;
    case "result":
      // The rule is the row: a turn boundary that happens to carry its cost,
      // rather than one more block of content in the column.
      return (
        <div className={`cb-turn-end${item.isError ? " cb-turn-end-error" : ""}`}>
          <span>{item.isError ? "turn errored" : "turn done"} · ${item.costUsd.toFixed(2)}</span>
        </div>
      );
  }
}

function MarkdownBlock({ markdown, streaming, render }: { markdown: string; streaming: boolean; render: (el: HTMLElement, md: string) => void }): React.JSX.Element {
  const ref = React.useRef<HTMLDivElement>(null);
  // MarkdownRenderer.render is async-append; re-running it per delta lets an
  // old render's continuation land after a newer clear. So the streaming
  // bubble is plain text, and markdown renders once on the finalized message.
  React.useEffect(() => {
    const el = ref.current;
    if (el === null || streaming) return;
    el.replaceChildren();
    render(el, markdown);
  }, [markdown, streaming, render]);
  return (
    <div className={`cb-msg cb-msg-assistant${streaming ? " cb-streaming" : ""}`} ref={ref}>
      {streaming ? markdown : null}
    </div>
  );
}

function ActivityPanel({ row }: { row: ActivityGroup }): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  // The chevron is one glyph rotated by CSS, so opening animates rather than
  // swapping characters — and reduced-motion can switch that off in styles.
  const classes = ["cb-activity", open ? "cb-activity-open" : "", row.running ? "cb-activity-running" : ""];
  return (
    <div className={classes.filter((c) => c !== "").join(" ")}>
      <button className="cb-activity-head" onClick={() => setOpen(!open)} aria-expanded={open}>
        <span className="cb-activity-chevron" aria-hidden="true">▸</span>
        <span className="cb-activity-label">{groupTitle(row)}</span>
      </button>
      {open ? (
        <ul className="cb-activity-body">
          {row.lines.map((line, i) => (
            <li key={i}>{line}</li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function ApprovalCard({ item, callbacks }: { item: Extract<TranscriptItem, { kind: "approval" }>; callbacks: ChatCallbacks }): React.JSX.Element {
  const [why, setWhy] = React.useState("");
  if (item.resolution !== "pending") {
    return <div className="cb-approval cb-approval-settled">{item.toolName} {item.targetPath ?? ""} — {item.resolution}</div>;
  }
  return (
    <div className="cb-approval">
      <div className="cb-approval-title">{item.title ?? `Outside the graph: ${item.targetPath ?? item.toolName}`}</div>
      <div className="cb-approval-reason">{item.reason}</div>
      <div className="cb-approval-actions">
        <button onClick={() => callbacks.onApprove(item.id, true)}>Allow</button>
        <button onClick={() => callbacks.onApprove(item.id, false, why.trim() === "" ? undefined : why.trim())}>Deny</button>
        <input placeholder="why not (optional, the model sees it)" value={why} onChange={(e) => setWhy(e.target.value)} />
      </div>
    </div>
  );
}
