# Note-Specific Behaviour in the Chat

**Date:** 2026-08-13
**Status:** Built and merged onto `feat/current-note-behaviour`, 2026-08-13.

Three things on the branch are not described below, each of them a review finding
rather than a change of mind: `activeNoteIn` also requires a `.md` file, so a picture
in a project folder is not "the note you are reading"; `announced` is cleared when
`claude.exe` dies as well as on a reload, since both start a fresh process; and the
preset *offers* to close a question it finds already answered rather than closing it,
because `system.md` reserves closing to the user. The `render()`-time diff guard
below applies only to `model.onChange` — `file-open` and `active-leaf-change` are
user-driven and repaint unconditionally.

`docs/superpowers/plans/progress/2026-08-13-current-note-behaviour-checkpoint.md` is
the current picture. Read that before trusting this.

## Context

The chat panel and the note you are reading currently know nothing about each
other. A conversation is bound to a project, and every message is addressed to
that project as a whole — so "answer the second one" sends the interviewer
grepping the entire graph for `- [ ]` lines, when what you meant was the two
questions sitting on the note filling your screen.

There is also nothing that says "this note owes three answers, let's deal with
them". The map's Heat switch shows *where* the debt is; the chat has no way to
act on it without you typing the note's name out.

Two things follow from that, and this design is both of them:

1. The interviewer should know which note you are looking at, so that what you
   say resolves against that note first and widens only when it plainly does not
   fit there.
2. A preset — **Current note questions** — that walks the open questions on that
   note, one at a time. It appears only when there is something to press it for.

## Goals

1. The interviewer is told which note the user is reading: on the first message
   of a conversation, and thereafter only when the note changes.
2. That line is context, never content — the same footing as the date line in
   the session preamble, which the prompts already handle correctly.
3. A message carries the note it was **composed** against, so a message queued
   while reading one note does not silently retarget when you wander off during
   the turn.
4. A `Current note questions` preset appears in the composer's preset row when,
   and only when, the note you are reading belongs to this tab's project and has
   at least one open question.
5. That row updates live: on opening a note, on switching panes, and on the
   count changing because you edited the note.
6. Every decision lands in a pure, unit-tested module. The React shell and the
   `ItemView` do plumbing only.

## Non-goals

- Reading the note's content into the message. The interviewer has file tools
  and reads the note itself; a count decides only whether a button exists.
- Changing the other two presets, or how the row collapses.
- Cross-project convenience. A tab bound to project A stays silent about a note
  in project B rather than offering to follow you there.
- Anything on the map. Heat already answers "where is the debt".

## Design

### The two halves, and why they are one mechanism

The preset needs the interviewer to know which note is meant. So does a typed
message. Rather than baking a path into the preset's text *and* announcing it
for typed messages, there is one channel: **every message carries the note it
was composed against, and the plugin announces that note when the model's
picture of it is out of date.**

The preset's prose can then say "the note I am looking at" and be guaranteed to
resolve, because pressing the button carries the note, which fires the
announcement if the model has not already been told. No interpolation, no
template syntax in the prompt files, one thing to test.

### `src/chat/note-context.ts` — new, pure

```ts
/**
 * The line telling the interviewer which note the user is reading, or null when
 * what it already believes is still true.
 */
export function noteAnnouncement(
  open: string | null,
  announced: string | null | undefined,
): string | null;
```

`announced` is what this conversation has been told so far; `undefined` means
nothing has been said yet.

| `open` | `announced` | result |
| --- | --- | --- |
| `A` | `undefined` | announce `A` — the first message of a conversation |
| `A` | `A` | `null` — it already knows |
| `B` | `A` | announce `B` — the user switched notes |
| `null` | `A` | announce that the user has left — otherwise the model goes on resolving against a note that is no longer open |
| `null` | `undefined` | `null` — no opening line about nothing |

The caller sets `announced = open` whenever a line came back, and leaves it
alone otherwise. That single rule keeps the table above consistent in both
directions, including a return to a note that was announced before.

The wording of the line follows the date line in `buildSessionPreamble`:

> The user is looking at `Fiction/Solaris/The contact.md`. It is context for
> you, never content.

### What counts as "open"

A chat tab is bound to one project. A note belonging to a **different** project
counts as `null` for that tab — the same fail-closed instinct as
`src/agent/permissions.ts`, where a tab bound to project A must never be aimed
at a path in project B.

So "the note you are reading" means: the workspace's active file, if
`model.graphOf(path)` equals this tab's `graphDir`. Otherwise nothing.

### `src/chat/queue.ts` — one field

```ts
export interface Outgoing {
  text: string;
  label?: string;
  /** The note this was composed against. Absent when none was open in this project. */
  note?: string;
}
```

Composition time, not send time, is the honest moment: the message means the
note you were looking at when you wrote it. `Queued extends Outgoing`, so a
queued message keeps its note through a cancel and a resend.

### `src/chat/components.tsx` — one new prop

`ChatSurface` gains `openQuestions: number` and passes it to `visiblePresets`.
That is the whole of its involvement: the component never learns a path, never
attaches one to a message, and cannot forget to.

### `src/chat/ChatView.tsx` — where the line is stitched

Every outgoing message is stamped with the open note in one place, the panel's
`onSend` callback, at the moment you press Send or a preset:

```ts
onSend: (message: Outgoing): void => {
  const session = activeSession(this.list);
  const note = session.graphDir === null ? undefined : this.plugin.activeNoteIn(session.graphDir)?.path;
  this.pump(session.key, note === undefined ? message : { ...message, note });
},
```

Typed messages and presets go through the same line, so neither can drift from
the other.

`Runtime` gains `announced: string | null | undefined`, initialised `undefined`.
It is live state, never persisted — which means after an Obsidian restart the
first message of a resumed conversation re-announces the note. That is the
behaviour we want: a resumed session may have been compacted, and re-stating
one line is cheaper than a wrong answer.

In `pump()`, at the point the message actually goes to the agent:

```ts
const line = noteAnnouncement(step.send.note ?? null, runtime.announced);
if (line !== null) runtime.announced = step.send.note ?? null;
handle.sendUserMessage(line === null ? step.send.text : `${line}\n\n${step.send.text}`);
```

The transcript still records `step.send.text` and its label. The announcement is
plumbing, like the session preamble — what you see is what you said.

### `assets/prompts/system.md` — the rule

A short block, near the existing statement about the date being context rather
than content: a line naming the open note may precede a message; treat what the
user says as being about that note first, and widen to the rest of the project
only when it plainly is not about it. Never write the path into a statement.

### `assets/prompts/presets/current-note-questions.md` — new

Prose, no placeholders. In substance:

> Work through the open questions on the note I am looking at.
>
> Read the note. Take its `## Open questions` in the order they are written and
> ask me the first one — in your own words, with whatever context I need in
> order to answer, and nothing else. Then wait.
>
> When I answer, close that question the way closing works, and ask the next
> one. Keep going until the section is empty or I stop you.
>
> Do not invent questions to fill the section out, and do not wander into
> another note's questions. This is about this one.

### `src/chat/presets.ts` — the row becomes a function of the count

`DIALOG_PRESETS` stays as it is. Added:

```ts
/** The preset row as it stands right now, given what the open note still owes. */
export function visiblePresets(openQuestions: number): readonly DialogPreset[];
```

Two static presets, plus the note preset appended when `openQuestions > 0`. It
goes **last**, so `Ask me` and `Summarize` keep fixed positions as the row grows
and shrinks under the cursor.

- `id`: `note-questions` — the React key, distinct so a row that gains the
  button re-renders it rather than reusing a neighbour's node.
- `label`: `Current note questions`
- `title`: `Work through this note's open questions, one at a time`

The module's standing promise — that a preset computes nothing about the graph —
survives intact. The count decides whether a **button** exists; it never reaches
the model, which reads the note itself and is therefore never staler than the
file.

### `src/open-questions.ts` — a move, not a rewrite

`countOpenQuestions` (and its `OPEN_BOX` / `FENCE` regexes) move out of
`src/mindmap/heat.ts` to a new top-level module. It was documented there as a
mindmap concern; with the composer needing it too it is a plugin concern, and
`src/` root already holds exactly this kind of shared module
(`project-list.ts`, `view-title.ts`, `claude-locator.ts`).

`heat.ts` keeps what makes it the mindmap's: `HEAT_MAX`, `heatBucket`,
`heatClass`. `src/mindmap/layout.ts` imports the counter from its new home.

Both surfaces then count the same way by construction, which matters — a button
that disagrees with the map about whether a note owes anything is worse than no
button.

### `src/main.ts` — the resolver

Beside `activeGraphDir()`, in the same thin style:

```ts
/** The note being read, when it belongs to this graph. Null when it does not, or none is. */
activeNoteIn(graphDir: string): { path: string; openQuestions: number } | null;
```

Active file → `model.graphOf(path) === graphDir` → count over `model.contentOf`.
`contentOf` returns `""` for a path the vault no longer holds, so a note deleted
between an event and the render reads as owing nothing rather than throwing.

### Keeping the row live

`ChatView` gains one method, `refreshNoteContext()`, subscribed from three
places:

- `workspace.on("file-open")` — a different note in the same pane.
- `workspace.on("active-leaf-change")` — a different pane. Clicking into the
  chat panel itself does not change `getActiveFile()`, so the note holds.
- `model.onChange()` — the count moved because the note was edited, in the
  editor or by the interviewer itself.

It recomputes `path` and `openQuestions` for the **active** session's graph,
compares against the pair it last saw, and re-renders only on a difference.
Without that guard, every vault edit anywhere in the vault would rebuild the
whole panel — including the `sharedSet()` walk over every other chat leaf.

## What we accept

- **Roughly fifteen tokens on some messages.** Only on the first message and on
  each note switch, so a long conversation about one note pays once.
- **A note-to-nothing announcement.** Closing every note, or moving to another
  project's note, spends a line saying so. Chosen over silence because a model
  quietly resolving against a note you left is a wrong answer with no visible
  cause.
- **`Outgoing` grows a third field.** Send-time capture would have been simpler
  and would have been wrong for exactly the case that motivates the feature.
- **The button's presence depends on a count the model never sees.** If the note
  is edited outside Obsidian and the index has not caught up, the button can be
  briefly wrong. The interviewer reads the note when pressed, so the worst case
  is a button that reports nothing to do — not a wrong answer.

## Testing

New:

- `tests/chat-note-context.test.ts` — the five rows of the announcement table,
  plus the `announced` update rule, plus a queued message keeping the note it
  was composed against through a cancel and a resend.
- `tests/open-questions.test.ts` — the counter's existing tests, moved with it.

Extended:

- `tests/chat-presets.test.ts` — the row at zero questions, at one, and the note
  preset's position within it.
- `tests/mindmap-heat.test.ts` — narrowed to the palette.
- `tests/prompts.test.ts` — the new preset file loads and is non-empty; the
  open-note rule is present in `system.md`.
- `docs/superpowers/manual-test-checklist.md` — the row appearing and vanishing
  as you move between notes and projects; one full ask → answer → close cycle
  driven from the button.

`npm run oracle && git diff --exit-code tests/expected` is unaffected: nothing
here touches the Python-parity core.

## Out of scope, noted for later

- A count on the button (`Current note questions (3)`). Considered and dropped —
  the row would jitter, and the map already answers "how much".
- Note-specific presets beyond questions: "summarise this note", "what does this
  note contradict". The mechanism here supports them; nobody has asked yet.
- Following you across projects. If the tab-per-project binding starts to chafe,
  that is a question about tabs, not about presets.

## Closed questions

**Q. Should the preset ask one question at a time, or list the note's whole debt first?**
A. One at a time, in written order — the rhythm `ask-me.md` and the interviewer's whole style already work in.

**Q. What happens when the open note belongs to a different project than the tab?**
A. The preset is hidden, exactly as when no note is open. A tab bound to one project never aims at another's notes.

**Q. How often is the open note announced to the interviewer?**
A. On the first message of a conversation, and thereafter only when the note changes.

**Q. What does the button say?**
A. `Current note questions`, plain — no count, no note name. The note's name is already in the title bar.

**Q. Where does the button sit in the preset row?**
A. Last, so the two permanent presets do not shift under the cursor as it appears and disappears.
