# Composite Activity Panels — Chat Tool Display

**Date:** 2026-08-12
**Status:** Approved for planning

## Context

Every tool the interviewer runs currently gets its own expandable bubble in the chat list —
`Read hub.md`, `Grep "parent:"`, `Write Detective.md`, one after another, each clickable to
reveal its raw JSON input. During a normal turn that is five to ten little rows of machinery
sitting between the user and the conversation they came for. It reads like a build log, not
like talking to someone.

This design collapses that machinery into two calm, composite panels: one for looking around,
one for filing. Each is a single line you can open if you're curious and ignore if you're not.

## Goals

1. Consecutive read-only tool calls render as **one** panel titled "Thinking…" while it runs,
   "Thought for 1m 20s" once it settles.
2. Consecutive note-writing tool calls render as **one** panel titled "Updating knowledge base…"
   while it runs, "Updated knowledge base" once it settles.
3. Both panels expand and collapse. Expanded, they list what actually happened, updating live
   as the turn proceeds.
4. Nothing that needs a click — an approval card — ever gets swallowed into a panel.
5. The decision logic lands in a pure, unit-tested module, not in the React shell.

## Non-goals

- Changing the mindmap view.
- Changing which tools the agent is allowed to run.
- Keeping the raw-JSON drill-down. It is replaced by the panel body, not supplemented by it.
- A live-ticking timer in the panel title. The title says "Thinking…" while running and the
  final duration when done — no per-second re-render.

## Design

### The seam we are preserving

`reduceTranscript` in `src/chat/transcript.ts` is a pure fold of session events into a flat list
of renderable items. It is also, via `ChatView.getState`, the **persisted** state of a chat tab
in `workspace.json`. `components.tsx` is a dumb renderer over that list.

Grouping is a view concern, so it becomes a second pure function over the item list rather than
new state inside the reducer. The reducer keeps its role as the event log; nothing about the
persisted shape needs a migration beyond two new optional numbers.

### Changes to `src/chat/transcript.ts`

A tool item becomes:

```ts
{ kind: "tool"; id: string; name: string; line: string;
  done: boolean; at: number | null; doneAt: number | null }
```

Three things happen here.

**`input` is dropped.** It existed only to feed the raw-JSON drill-down. Removing it also deletes
the stripping hack in `ChatView.getState` that kept whole note bodies out of `workspace.json`.

**Timestamps arrive.** `reduceTranscript(items, event, now)` takes the clock as a third argument
rather than putting `at` on individual events. The function stays pure — tests pass fixed
numbers — and the caller owns the clock. `at` is stamped on `tool-use`; `doneAt` on `tool-result`.

Both are nullable. `doneAt` is null while a tool is still running. `at` is null only for tool
items restored from a `workspace.json` written before this change.

The `tool-use` event gains an `existed: boolean` field. It keeps carrying `input`, which
`formatToolLine` still needs — `input` disappears from the stored *item*, not from the event.

**`formatToolLine` absorbs the scout prefix and learns write verbs.** Its signature becomes
`formatToolLine(name, input, ctx: { subagent: boolean; existed: boolean })`, and it produces the
one string a panel needs:

| Tool | Line |
|---|---|
| `Read` | `Read hub.md` |
| `Grep` / `Glob` | `Grep "parent:"` |
| `Task` | `Scout: trace the motif` |
| any, from a subagent | `scout · Read Detective.md` |
| `Write`, path is new | `Detective.md : added` |
| `Write`, path exists | `Detective.md : updated` |
| `Edit` | `hub.md : updated` |

`added` versus `updated` comes from an actual vault lookup at dispatch time, not from the tool
name. The agent re-`Write`s existing notes — that is exactly what the zero-byte recovery path in
`permissions.ts` tells it to do — so `Write` does not imply "new".

### New module: `src/chat/activity-groups.ts`

Pure. No Obsidian imports, no React, no clock.

```ts
export type ActivityMode = "explore" | "write";

export type ActivityRow =
  | { kind: "item";  key: string; item: TranscriptItem }
  | { kind: "group"; key: string; mode: ActivityMode;
      lines: string[]; running: boolean; elapsedMs: number | null };

export function groupActivity(items: TranscriptItem[], busy: boolean): ActivityRow[];
export function groupTitle(row: Extract<ActivityRow, { kind: "group" }>): string;
export function formatDuration(ms: number): string;
```

**Mode.** `Read`, `Glob`, `Grep`, `Task` are `explore`. `Write` and `Edit` are `write`. Any other
tool name falls back to `explore` — the permission table denies everything else, but a denied
call still produces a tool item, and it should stay visible rather than vanish.

**Run boundaries.** A run breaks on any non-tool item, or on a change of mode. Assistant text,
approval cards, notices and the turn-cost row all split panels. This keeps the elapsed time an
honest single span and keeps the agent's voice in the open.

**`running`.** True when `busy` is true *and* the group is the last row. Everything settles the
moment `busy` goes false, so a tab restored from disk can never show a panel stuck on "Thinking…".

**`elapsedMs`.** The *last tool's* `doneAt` minus the *first tool's* `at`. Null when either of those
two is null — a run whose final tool never returned because the session died, or a legacy item
with no timestamps. Nulls on tools in the middle of the run do not matter; the span is defined by
its ends.

**`key`.** For a group, its first tool's id. For a plain item, its index in the source list. Items
only ever append, so both are stable, and a panel you expanded stays expanded as more tools land
in it.

### Titles

```
explore · running   →  "Thinking…"
explore · settled   →  "Thought for 1m 20s"    (or "Thought" when elapsedMs is null)
write   · running   →  "Updating knowledge base…"
write   · settled   →  "Updated knowledge base"
```

`formatDuration` drops zero units and always shows at least one:

| ms | out |
|---|---|
| 0 | `0s` |
| 45_000 | `45s` |
| 60_000 | `1m` |
| 80_000 | `1m 20s` |
| 3_605_000 | `1h 5s` |
| 3_665_000 | `1h 1m 5s` |

### Changes to `src/chat/components.tsx`

`ChatSurface` maps over `groupActivity(props.items, props.busy)` instead of `props.items`, using
each row's `key`. `ToolRow` is replaced by `ActivityPanel` — a header `<button>` that toggles
local `open` state, and a body listing `row.lines` when open. The auto-scroll effect keeps
watching `props.items`.

No branching beyond "group or item" lands in this file.

### Changes to `src/chat/ChatView.tsx`

`dispatch` passes `Date.now()` into `reduceTranscript`. `onToolUse` resolves the tool's target
against the vault and asks `app.vault.getAbstractFileByPath` whether it already exists, passing
the answer through as `existed`.

`getState` loses the `input`-stripping map. `setState` normalizes legacy tool items — drop
`input`, default `at` and `doneAt` to null — alongside the existing streaming-flag fixup.

### One export in `src/agent/permissions.ts`

`resolveTarget` gains an `export` keyword so `ChatView` resolves a tool path exactly the way the
permission table does, instead of duplicating the absolute-vs-relative rule. **No decision logic
changes**, so per the project's CLAUDE.md rule this does not require `npm run test:live`.

### Styling

The `.cb-tool*` rules in `styles.css` are replaced by `.cb-activity*`: muted, `--font-ui-smaller`,
a chevron on the header, an indented body. Same visual weight as today's tool rows — the win is
that there is one of them instead of eight.

## What we accept

**"removed" is unreachable.** The agent's tool contract is `Read / Write / Edit / Glob / Grep /
Task` (`agent-service.ts`). Nothing deletes a note. The verb vocabulary in this design is
`added | updated`; if deletion is ever added to the contract, a third verb slots in without
reshaping anything.

**Two "thinking" indicators.** The chat header already renders the SDK's status text when busy.
During a read run the user sees that *and* a "Thinking…" panel below. They say different things
(the header carries the SDK's own status word), so the header is left alone. Revisit if it grates
in use.

**Approval cards interrupt a run.** A permission prompt splits the panel in two. That is
deliberate — the card needs a click and must not be hidden behind a collapsed header.

## Testing

**New — `tests/activity-groups.test.ts`,** written test-first:

- a run of reads becomes one explore group; a run of writes becomes one write group
- assistant text between two read batches produces two groups, not one
- a read run followed by a write run produces two groups
- an approval card splits a run
- `running` is true only for a trailing group while busy, false for every group when idle
- `elapsedMs` spans first `at` to last `doneAt`; null when a timestamp is missing
- group keys are stable as tools are appended
- `formatDuration` over the table above
- `groupTitle` over all four mode/running combinations, plus the null-duration fallback

**Updated — `tests/transcript.test.ts`:** the `now` argument, the dropped `input` field, the new
write-line format, and the scout prefix moving into `formatToolLine`.

**Manual — `docs/superpowers/manual-test-checklist.md`** gains a line: run a turn that reads and
writes, confirm two panels, expand both mid-turn, confirm lines appear live and the title settles
to a duration.

The panels themselves stay manual-test-only, per the project's standing rule that the view shells
carry no decision logic worth unit-testing.

## Out of scope, noted for later

- Collapsing an entire settled turn into a single summary row.
- Showing tool *results* (row counts, match counts) in the panel body.
- A delete verb, which would need a change to the agent's tool contract first.
