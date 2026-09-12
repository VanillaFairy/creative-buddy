# src/chat

## PURPOSE

The chat panel: one Obsidian leaf holding several conversations behind a tab
strip. `ChatView.tsx` and `components.tsx` are shells — DOM, React and the
clock — and every rule they obey lives in a pure module beside them with its own
test. The shells are manual-test only, so a decision left inside one is a
decision nothing checks.

## KEY ABSTRACTIONS

- `reduceTranscript` (`transcript.ts`) folds SDK events into `TranscriptItem[]`,
  and that array is **persisted verbatim into `workspace.json`** by
  `ChatView.getState`. It is not an in-memory render model: a field added to
  `TranscriptItem` ships to disk, and a field removed has to keep being tolerated
  on the way back.
- `restoreSessions` / `restoreItem` (`sessions.ts`) are the only migration point
  in the plugin, and already carry three generations of shape — the
  one-session-per-leaf panel that predates the tab strip, tool items written
  before activity panels (no timestamps, an `input` blob), and results written
  before a turn knew whether it was stopped or broken. Anything new must default
  here rather than trusting the stored row.
- `advance` (`queue.ts`) is the single entry point for sending, for a turn
  ending, and for a dead session coming back. Calling it from a fourth place is
  how a late message jumps the line.

## RESOURCE LIFECYCLE

One `Runtime` per conversation key, holding the SDK handle, the pending-approval
responders and the queue's hold timer. `disposeRuntime` must run when a
conversation is closed **or rebound to another graph** — see `src/agent`.

## INVARIANTS & GOTCHAS

- The panel repaints on `layout-change`, `file-open` and `active-leaf-change`,
  but a vault change repaints it **only when the open-question count of the note
  in front of you moved** (`refreshNoteContext`). An edit that changes a note's
  text without adding or closing a `- [ ]` correctly leaves the panel alone —
  which also means anything new drawn from note content will look stale until it
  is added to that check.

## DEPENDENCIES

`src/agent` for `EffortLevel` and the session handle. `src/graph` for
`baseName`. `src/open-questions` for the count `visiblePresets` gates on.
`src/settings` for `MODEL_CHOICES` — that import reaches Obsidian's runtime,
which is why the test config aliases `obsidian` to a stub.
