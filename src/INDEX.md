# src (plugin wiring)

## PURPOSE

`main.ts` is the only file that knows Obsidian's plugin lifecycle: it builds the
`GraphModel` from the vault, feeds it vault events, registers the two views and
resolves "which project is the user looking at". The loose modules beside it
(`open-questions.ts`, `project-list.ts`, `view-title.ts`, `claude-locator.ts`)
are here rather than in `chat/` or `mindmap/` because both surfaces need them
and neither owns them.

## KEY ABSTRACTIONS

- `countOpenQuestions` (`open-questions.ts`) is the one definition of "this note
  still owes an answer". The map colours by it and the composer gates a preset
  on it; the notation it counts is declared in `assets/prompts/system.md`, so it
  is a contract with prose, not with code.
- `project-list.ts` holds the pickers' copy and row shape because the chat
  renders in React and the map in plain DOM. Wording added to one renderer
  instead of here is wording that drifts.

## RESOURCE LIFECYCLE

`buildModel` subscribes the vault listeners **before** the seeding loop, then
publishes `this.model` and drains `modelReadyCallbacks` only once seeding
finishes. So `graphOf`, `activeGraphDir` and `activeNoteIn` all answer null for
the first seconds of a session, and `onModelReady` is the only wake-up — its
disposer must go through `Component.register`, or a closed view is revived by a
late model.

## INVARIANTS & GOTCHAS

- The list of models exists twice and nothing ties the two together:
  `MODEL_CHOICES` in `settings.ts` decides what the pickers offer,
  `HONOURED` in `agent/effort.ts` decides which of those get an effort control.
  `haiku` is deliberately in the first and not the second. Both are keyed by
  family alias (`opus`, not `claude-opus-5`), so the CLI always runs the
  family's newest version; `asFamily` in the same file collapses a pinned id
  read back from disk onto its family, and its pattern is a third place the
  family names appear. A model
  added only to `MODEL_CHOICES` silently loses its effort row; one added only to
  `HONOURED` is unreachable.

## DEPENDENCIES

`src/graph` (the model and path helpers), `src/agent` (effort levels, for the
settings tab), `src/chat` and `src/mindmap` (the two registered views).
