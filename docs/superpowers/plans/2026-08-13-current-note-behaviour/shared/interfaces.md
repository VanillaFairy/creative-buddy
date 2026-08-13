# Shared Interfaces

**Version:** 1.0

Every signature below is a contract between tasks. Match them exactly — a name that
drifts between the task that writes it and the task that calls it is the one bug this
file exists to prevent.

## Open-question counter

**Produced by:** T01
**Consumed by:** T06 (`src/main.ts`), `src/mindmap/layout.ts`

```typescript
// src/open-questions.ts
export function countOpenQuestions(noteText: string): number;
```

Moved verbatim from `src/mindmap/heat.ts`, along with its `OPEN_BOX` and `FENCE`
regexes and its imports from `../graph/frontmatter` and `../graph/reader` (which
become `./graph/frontmatter` and `./graph/reader` at the new depth). Behaviour does
not change. `heat.ts` keeps `HEAT_MAX`, `heatBucket`, `heatClass` and stops exporting
the counter.

## Note announcement

**Produced by:** T02
**Consumed by:** T07 (`ChatView.pump`)

```typescript
// src/chat/note-context.ts
export function noteAnnouncement(
  open: string | null,
  announced: string | null | undefined,
): string | null;
```

- `open` — the note the message was composed against, or `null` when none was open in
  this tab's project.
- `announced` — what this conversation has already been told. `undefined` means
  nothing has been said yet.
- Returns the line to prepend, or `null` when the interviewer's picture is already
  correct.

Exact strings, which T07 does not reproduce and no test may paraphrase:

```
The user is looking at `<path>`. It is context for you, never content.
The user is not looking at any note in this graph.
```

## A message and its note

**Produced by:** T03
**Consumed by:** T07

```typescript
// src/chat/queue.ts
export interface Outgoing {
  text: string;
  label?: string;
  /** The note this message was composed against. Absent when none was open. */
  note?: string;
}
```

`Queued extends Outgoing` unchanged. `advance()` must carry `note` through onto the
message it hands back in `send` — today it rebuilds that object from `text` and
`label` only, which would drop the field silently.

## The preset row

**Produced by:** T04
**Consumed by:** T07 (`components.tsx`)

```typescript
// src/chat/presets.ts
export interface DialogPreset {
  id: string;
  label: string;
  title: string;
  prompt: string;
}

export const DIALOG_PRESETS: readonly DialogPreset[];

/** The preset row as it stands right now, given what the open note still owes. */
export function visiblePresets(openQuestions: number): readonly DialogPreset[];
```

The note preset's fields, fixed:

- `id`: `"note-questions"`
- `label`: `"Current note questions"`
- `title`: `"Work through this note's open questions, one at a time"`
- `prompt`: the contents of `assets/prompts/presets/current-note-questions.md`

It is appended **after** the two static presets, and only when `openQuestions > 0`.

## The active note

**Produced by:** T06
**Consumed by:** T07

```typescript
// src/main.ts, on class CreativeBuddyPlugin
activeNoteIn(graphDir: string): { path: string; openQuestions: number } | null;
```

Null when no file is active, when the index is not built yet, or when the active file
belongs to a different graph.

## The composer's new prop

**Produced by:** T07 (both sides land in the same task)

```typescript
// src/chat/components.tsx — added to ChatSurface's props and passed to PresetRow
openQuestions: number;
```

The component never learns a path. `ChatView.onSend` stamps `note` centrally, so a
typed message and a preset cannot drift apart.
