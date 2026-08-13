import * as React from "react";
import { TranscriptItem } from "./transcript";
import { groupActivity, groupTitle, ActivityGroup, ActivityItem } from "./activity-groups";
import { Outgoing, Queued, hasWaiting } from "./queue";
import { draggedHeight, heightBounds, pxLength } from "./composer-size";
import { DIALOG_PRESETS } from "./presets";
import { anchoredScrollTop, bottomGap } from "./scroll-anchor";
import { MODEL_CHOICES } from "../settings";
import { PICKER_EMPTY, PICKER_INDEXING, ProjectRow, noteCount, projectRowLabel } from "../project-list";

export interface ChatCallbacks {
  /** What you typed, or a preset carrying the name it should be shown under. */
  onSend(message: Outgoing): void;
  onModelChange(model: string): void;
  onApprove(id: string, allow: boolean, message?: string): void;
  /** Stop the turn in flight and take back everything still waiting behind it. */
  onInterrupt(): void;
  /** Take one waiting message back, or put a canceled one back in line. */
  onQueuedCanceled(index: number, canceled: boolean): void;
  /** Show or hide the preset row. The panel remembers the answer. */
  onPresetsToggle(open: boolean): void;
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
  queued: Queued[];
  presetsOpen: boolean;
  callbacks: ChatCallbacks;
}): React.JSX.Element {
  const { callbacks } = props;
  const [draft, setDraft] = React.useState("");
  const listRef = React.useRef<HTMLDivElement>(null);
  const boxRef = React.useRef<HTMLTextAreaElement>(null);
  // null until you drag the grip, so min-height governs the resting size and
  // the CSS stays in charge of what "three lines" means.
  const [boxHeight, setBoxHeight] = React.useState<number | null>(null);
  // Anything the agent is spending on your behalf, in flight or lined up behind
  // it. It is what the composer offers to stop, and what Escape stops.
  const running = props.busy || hasWaiting(props.queued);
  // How much transcript sat below the fold when a resize began. See
  // scroll-anchor.ts for why that is the number worth holding.
  const anchorRef = React.useRef<number | null>(null);

  React.useEffect(() => {
    const list = listRef.current;
    if (list !== null) list.scrollTo({ top: list.scrollHeight });
  }, [props.items]);

  // Layout, not effect: this runs once the new height is in the DOM but before
  // the frame is painted, so the transcript is never drawn in the wrong place
  // and corrected afterwards — which is the lurch it exists to prevent.
  React.useLayoutEffect(() => {
    const list = listRef.current;
    const gap = anchorRef.current;
    if (list !== null && gap !== null) list.scrollTop = anchoredScrollTop(list, gap);
  }, [boxHeight]);

  /** Take the bearing the resize will steer back to. Runs before the box moves. */
  const takeAnchor = (): void => {
    const list = listRef.current;
    anchorRef.current = list === null ? null : bottomGap(list);
  };

  // No busy guard: a message typed during a turn joins the queue rather than
  // being refused, which is the whole reason the queue exists.
  const send = (): void => {
    const text = draft.trim();
    if (text === "") return;
    setDraft("");
    callbacks.onSend({ text });
  };

  /** How far the box may be dragged, straight off the CSS that drew it. */
  const bounds = (box: HTMLTextAreaElement): { min: number; max: number } => {
    const style = window.getComputedStyle(box);
    return heightBounds(style.minHeight, style.maxHeight);
  };

  /**
   * The box's height in the same coordinates as its own min and max — which is
   * whichever box `box-sizing` names. getBoundingClientRect is always the
   * border box, so measuring with it while clamping against content-box limits
   * drifts by the padding on every step of a keyboard resize.
   */
  const currentHeight = (box: HTMLTextAreaElement): number =>
    pxLength(window.getComputedStyle(box).height) ?? box.getBoundingClientRect().height;

  // Pointer capture rather than window listeners: the pointer keeps reporting
  // to the grip once it has left it, and the browser tears the gesture down
  // itself if something else claims the pointer mid-drag.
  const startResize = (event: React.PointerEvent<HTMLDivElement>): void => {
    const box = boxRef.current;
    if (box === null) return;
    event.preventDefault();
    const grip = event.currentTarget;
    const startY = event.clientY;
    const startHeight = currentHeight(box);
    const limits = bounds(box);
    // Once, at the start. Re-reading it per move would measure a transcript the
    // previous move had already corrected, and the rounding would accumulate
    // across the drag.
    takeAnchor();
    grip.setPointerCapture(event.pointerId);
    const move = (e: PointerEvent): void => setBoxHeight(draggedHeight(startHeight, e.clientY - startY, limits));
    const stop = (): void => {
      grip.removeEventListener("pointermove", move);
      grip.removeEventListener("pointerup", stop);
      grip.removeEventListener("pointercancel", stop);
    };
    grip.addEventListener("pointermove", move);
    grip.addEventListener("pointerup", stop);
    grip.addEventListener("pointercancel", stop);
  };

  /** The same gesture without a pointer — one line per press. */
  const nudgeResize = (event: React.KeyboardEvent<HTMLDivElement>): void => {
    const box = boxRef.current;
    const step = event.key === "ArrowUp" ? -1 : event.key === "ArrowDown" ? 1 : 0;
    if (box === null || step === 0) return;
    event.preventDefault();
    takeAnchor();
    setBoxHeight(draggedHeight(currentHeight(box), step * 24, bounds(box)));
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
      {hasWaiting(props.queued) ? <p className="cb-queued-note">Waiting for this turn to finish</p> : null}
      {props.queued.length > 0 ? (
        <ul className="cb-queued">
          {props.queued.map((message, i) => (
            <li
              key={i}
              className={`cb-queued-item${message.canceled ? " cb-queued-canceled" : ""}${message.label === undefined ? "" : " cb-queued-preset"}`}
            >
              <span className="cb-queued-text">{message.label ?? message.text}</span>
              {message.canceled ? (
                <>
                  <em className="cb-queued-state">canceled</em>
                  {/* The one live thing on a dead row, so it does not hide until
                      hovered the way the × does. */}
                  <button
                    className="cb-queued-resend"
                    aria-label="Send this message after all"
                    title="Send this message after all"
                    onClick={() => callbacks.onQueuedCanceled(i, false)}
                  >
                    ↻
                  </button>
                </>
              ) : (
                <button
                  className="cb-queued-cancel"
                  aria-label="Cancel this message"
                  title="Cancel this message"
                  onClick={() => callbacks.onQueuedCanceled(i, true)}
                >
                  ×
                </button>
              )}
            </li>
          ))}
        </ul>
      ) : null}
      {/* The line between the transcript and the composer is also the handle
          that moves it — the boundary you are dragging is the boundary you can
          see. Double-click puts it back. */}
      <div
        className="cb-composer-grip"
        role="separator"
        aria-orientation="horizontal"
        aria-label="Resize the message box"
        title="Drag to resize the message box — double-click to reset"
        tabIndex={0}
        onPointerDown={startResize}
        onDoubleClick={() => {
          takeAnchor();
          setBoxHeight(null);
        }}
        onKeyDown={nudgeResize}
      />
      <div className="cb-chat-composer">
        <textarea
          ref={boxRef}
          style={boxHeight === null ? undefined : { height: `${boxHeight}px` }}
          value={draft}
          placeholder={running ? "Enter queues this for when the turn ends" : "Say something to the interviewer — Enter sends"}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey) {
              e.preventDefault();
              send();
            }
            // Escape stops the turn the way it does in Claude Code. It is the
            // keyboard's way to the button on the right, so it only means that
            // while there is something to stop.
            if (e.key === "Escape" && running) {
              e.preventDefault();
              callbacks.onInterrupt();
            }
          }}
        />
        {/* One button, because there is only ever one thing worth doing with a
            click here: stop what is running, or send what is typed. Queueing is
            Enter's job — the placeholder says so while a turn is up. */}
        {running ? (
          <button className="cb-stop" onClick={() => callbacks.onInterrupt()}>
            <span className="cb-stop-glyph" aria-hidden="true" />
            Stop
          </button>
        ) : (
          <button onClick={send} disabled={draft.trim() === ""}>Send</button>
        )}
      </div>
      <PresetRow open={props.presetsOpen} callbacks={callbacks} />
    </div>
  );
}

/**
 * The canned openings, under the box you type in.
 *
 * A preset says its text as though you had typed it, so it goes out through the
 * same `onSend` as Enter — which is what gets it queued behind a running turn,
 * recorded in the transcript when it actually goes, and stoppable. There is no
 * separate path for it because there is no separate thing happening.
 *
 * Collapsed still shows the toggle. A row that vanishes entirely is a feature
 * you have to remember exists.
 *
 * The toggle carries no visible word. "Presets" is its accessible name and its
 * tooltip, which is where a hint belongs — asked for, rather than sitting on
 * screen forever explaining two buttons that already say what they do.
 */
function PresetRow({ open, callbacks }: { open: boolean; callbacks: ChatCallbacks }): React.JSX.Element {
  return (
    <div className={`cb-presets${open ? " cb-presets-open" : ""}`}>
      <button
        className="cb-presets-toggle"
        aria-label="Presets"
        aria-expanded={open}
        title={open ? "Hide the presets" : "Show the presets"}
        onClick={() => callbacks.onPresetsToggle(!open)}
      >
        {/* Points the way the row moves: right, into the space the buttons are
            about to fill, and back to the left to fold them away again. One
            glyph turned by CSS, like the activity panels, so it animates rather
            than swapping characters and reduced-motion can stop it. */}
        <span className="cb-presets-chevron" aria-hidden="true">▸</span>
      </button>
      {open
        ? DIALOG_PRESETS.map((preset) => (
            <button
              key={preset.id}
              className="cb-preset"
              title={preset.title}
              onClick={() => callbacks.onSend({ text: preset.prompt, label: preset.label })}
            >
              {preset.label}
            </button>
          ))
        : null}
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
      // A preset stands in the column as the button that sent it, not as the
      // paragraph of standing instructions behind it. The text is still on the
      // item, so the record is exact — it is just not what you read.
      return item.label === undefined ? (
        <div className="cb-msg cb-msg-user">{item.text}</div>
      ) : (
        <div className="cb-msg cb-msg-preset">{item.label}</div>
      );
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
