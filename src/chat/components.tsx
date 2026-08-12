import * as React from "react";
import { TranscriptItem } from "./transcript";
import { groupActivity, groupTitle, ActivityGroup, ActivityItem } from "./activity-groups";
import { MODEL_CHOICES } from "../settings";

export interface ChatCallbacks {
  onSend(text: string): void;
  onModelChange(model: string): void;
  onApprove(id: string, allow: boolean, message?: string): void;
  onWrapUp(): void;
  onInterrupt(): void;
  renderMarkdown(el: HTMLElement, markdown: string): void;
}

export function ChatSurface(props: {
  graphLabel: string;
  model: string;
  busy: boolean;
  status: string | null;
  duplicateTab: boolean;
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
        <span className="cb-chat-graph">{props.graphLabel}</span>
        {props.duplicateTab ? <span className="cb-chat-dup" title="Another tab is bound to this graph — last write wins.">⚠ shared</span> : null}
        <select value={props.model} onChange={(e) => callbacks.onModelChange(e.target.value)}>
          {Object.entries(MODEL_CHOICES).map(([id, label]) => (
            <option key={id} value={id}>{label}</option>
          ))}
        </select>
        <button onClick={() => callbacks.onWrapUp()} disabled={props.busy}>Wrap up</button>
        {props.busy ? <span className="cb-chat-status">{props.status ?? "thinking…"}</span> : null}
        {props.busy ? <button onClick={() => callbacks.onInterrupt()}>Stop</button> : null}
      </header>
      <div className="cb-chat-list" ref={listRef}>
        {groupActivity(props.items, props.busy).map((row) =>
          row.kind === "group"
            ? <ActivityPanel key={row.key} row={row} />
            : <TranscriptRow key={row.key} item={row.item} callbacks={callbacks} />,
        )}
      </div>
      <div className="cb-chat-composer">
        <textarea
          value={draft}
          placeholder="Say something to the interviewer…"
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

function TranscriptRow({ item, callbacks }: { item: ActivityItem; callbacks: ChatCallbacks }): React.JSX.Element {
  switch (item.kind) {
    case "user":
      return <div className="cb-msg cb-msg-user">{item.text}</div>;
    case "assistant":
      return <MarkdownBlock markdown={item.markdown} streaming={item.streaming} render={callbacks.renderMarkdown} />;
    case "approval":
      return <ApprovalCard item={item} callbacks={callbacks} />;
    case "notice":
      return <div className={`cb-msg cb-notice cb-notice-${item.tone}`}>{item.text}</div>;
    case "result":
      return <div className="cb-msg cb-cost">turn done · ${item.costUsd.toFixed(2)}{item.isError ? " · errored" : ""}</div>;
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
