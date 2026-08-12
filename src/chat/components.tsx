import * as React from "react";
import { TranscriptItem } from "./transcript";
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
        {props.items.map((item, i) => (
          <TranscriptRow key={i} item={item} callbacks={callbacks} />
        ))}
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

function TranscriptRow({ item, callbacks }: { item: TranscriptItem; callbacks: ChatCallbacks }): React.JSX.Element {
  switch (item.kind) {
    case "user":
      return <div className="cb-msg cb-msg-user">{item.text}</div>;
    case "assistant":
      return <MarkdownBlock markdown={item.markdown} streaming={item.streaming} render={callbacks.renderMarkdown} />;
    case "tool":
      return <ToolRow item={item} />;
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

function ToolRow({ item }: { item: Extract<TranscriptItem, { kind: "tool" }> }): React.JSX.Element {
  const [open, setOpen] = React.useState(false);
  return (
    <div className={`cb-tool${item.done ? " cb-tool-done" : ""}`}>
      <button className="cb-tool-line" onClick={() => setOpen(!open)}>
        {item.done ? "✓" : "…"} {item.line}
      </button>
      {open && Object.keys(item.input).length > 0 ? <pre className="cb-tool-raw">{JSON.stringify(item.input, null, 2)}</pre> : null}
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
