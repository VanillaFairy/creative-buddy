# Task T07: Chat wiring

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md`
- Read: `../shared/conventions.md`
- Read: `../../knowledge/typecheck-build.md`
- Read: `../../knowledge/commit.md`
- Read: `src/mindmap/MindmapView.tsx`, `onOpen`/`onClose` — the `model.onChange`
  subscribe-and-dispose pattern this task copies

## Dependencies
- Depends on: T02 (note announcement), T03 (`Outgoing.note`), T04 (`visiblePresets`),
  T06 (`activeNoteIn`)
- Depended on by: T08 (docs and checklist)

## Scope
**Files:**
- Modify: `src/chat/ChatView.tsx`
- Modify: `src/chat/components.tsx`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Why the two files are one task

`components.tsx` gains a required prop that only `ChatView` can supply. Landing either
half alone leaves the typecheck red, and this repo does not commit red. It is one
change: the shell learning to pass through what four modules already decided.

There are no unit tests here, by design — `ChatView` is an `ItemView` and is
manual-test-only. Every decision this task touches was already tested in T02, T03, T04
and T06. If you catch yourself writing a condition with judgement in it, it belongs in
one of those modules, not here.

## Positive Constraints (DO)
- Keep `noteInView` as the single source for the note in front of the active tab.
  `refreshNoteContext()` is the only thing that writes it.
- Call `refreshNoteContext()` at the top of `render()`. That is what makes a tab switch,
  a restored panel and a graph pick correct without each of them having to remember.
- Dispose the `model.onChange` subscription in `onClose`, the way `MindmapView` does.

## Negative Constraints (DO NOT)
- Do NOT put the announcement into the transcript. `dispatch({type: "user-sent"})` keeps
  taking `step.send.text` — the panel shows what was said, not what was wired.
- Do NOT re-render on every `model.onChange`. It fires for a vault edit anywhere in any
  project; unguarded, every keystroke elsewhere would rebuild the transcript and walk
  every other chat leaf.
- Do NOT let `components.tsx` learn a note path. It gets a number.
- Do NOT persist `announced` in `getState`. It is live state; a resumed conversation
  re-announcing on its first message is the behaviour we want.

## Implementation Steps

- [ ] **Step 1: Import the new modules**

In `src/chat/ChatView.tsx`, beside the existing chat imports:

```typescript
import { noteAnnouncement } from "./note-context";
```

In `src/chat/components.tsx`, replace:

```typescript
import { DIALOG_PRESETS } from "./presets";
```

with:

```typescript
import { visiblePresets } from "./presets";
```

- [ ] **Step 2: Give a conversation somewhere to remember what it has said**

In `src/chat/ChatView.tsx`, in `interface Runtime`, after `queue`:

```typescript
  /**
   * The note this conversation has been told about, or undefined while nothing
   * has been said yet. Live state on purpose: after a reload the first message of
   * a resumed conversation says it again, which is right — a resumed session may
   * have had its context compacted since.
   */
  announced: string | null | undefined;
```

In `runtime()`, in the `fresh` object literal, after `queue: []`:

```typescript
      announced: undefined,
```

- [ ] **Step 3: Add the note-in-view field and its refresh**

In `src/chat/ChatView.tsx`, beside `presetsShown`:

```typescript
  /** What the active tab's project has open, as of the last refresh. Drives the preset row. */
  private noteInView: { path: string; openQuestions: number } | null = null;
  private offModelChange: (() => void) | null = null;
```

Then add this method next to `sourcePath()`:

```typescript
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
```

- [ ] **Step 4: Subscribe to the three things that move the row**

In `src/chat/ChatView.tsx`, in `onOpen`, replace:

```typescript
    this.register(this.plugin.onModelReady(() => this.render()));
    this.registerEvent(this.app.workspace.on("layout-change", () => this.render()));
```

with:

```typescript
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
```

In `onClose`, as the first line:

```typescript
    this.offModelChange?.();
```

- [ ] **Step 5: Stamp every outgoing message with its note**

In `src/chat/ChatView.tsx`, in the `callbacks` object, replace:

```typescript
    onSend: (message: Outgoing): void => {
      this.pump(activeSession(this.list).key, message);
    },
```

with:

```typescript
    onSend: (message: Outgoing): void => {
      // Stamped here rather than at the point it goes out, so a message queued
      // behind a running turn still means the note you wrote it about — one place
      // for it, so a preset and something you typed cannot come to mean different
      // things.
      this.refreshNoteContext();
      const note = this.noteInView?.path;
      this.pump(activeSession(this.list).key, note === undefined ? message : { ...message, note });
    },
```

- [ ] **Step 6: Say the note when the message goes out**

In `src/chat/ChatView.tsx`, at the end of `pump`, replace:

```typescript
    runtime.busy = true;
    this.dispatch(key, { type: "user-sent", text: step.send.text, label: step.send.label });
    handle.sendUserMessage(step.send.text);
```

with:

```typescript
    runtime.busy = true;
    this.dispatch(key, { type: "user-sent", text: step.send.text, label: step.send.label });
    // The transcript keeps what was said; the note line is plumbing that rides
    // along with it, like the session preamble, and is not part of the record.
    const note = step.send.note ?? null;
    const line = noteAnnouncement(note, runtime.announced);
    if (line !== null) runtime.announced = note;
    handle.sendUserMessage(line === null ? step.send.text : `${line}\n\n${step.send.text}`);
```

- [ ] **Step 7: Hand the count to the composer**

In `src/chat/ChatView.tsx`, at the top of `render()`, before `const shared = …`:

```typescript
    this.refreshNoteContext();
```

and in the `<ChatSurface …>` element, after `presetsOpen={this.presetsShown}`:

```tsx
            openQuestions={this.noteInView?.openQuestions ?? 0}
```

- [ ] **Step 8: Take the count through the composer to the row**

In `src/chat/components.tsx`, in `ChatSurface`'s props type, after `presetsOpen: boolean;`:

```typescript
  /** What the note in front of you still owes. Zero hides the note preset. */
  openQuestions: number;
```

Replace the `<PresetRow …>` element near the end of `ChatSurface`:

```tsx
      <PresetRow open={props.presetsOpen} openQuestions={props.openQuestions} callbacks={callbacks} />
```

And change `PresetRow`'s signature and its map:

```tsx
function PresetRow({
  open,
  openQuestions,
  callbacks,
}: {
  open: boolean;
  openQuestions: number;
  callbacks: ChatCallbacks;
}): React.JSX.Element {
```

```tsx
      {open
        ? visiblePresets(openQuestions).map((preset) => (
```

Leave the button body — `key`, `className`, `title`, `onClick`, label — exactly as it
is. The new preset goes out through the same `onSend` as the other two, which is what
gets it queued, recorded and stoppable like anything else.

- [ ] **Step 9: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 10: Run the suite**

Run: `npx vitest run`
Expected: PASS, everything.

- [ ] **Step 11: Build**

Run: `npm run build`
Expected: completes, writes `main.js`. This is the real check on this task — nothing
here has a unit test, and green tests do not mean the plugin compiles.

- [ ] **Step 12: Deploy and look at it**

```bash
deploy.bat
```

Then in the dev vault: reload the plugin, open a chat on a project, and open a note in
that project which has at least one `- [ ]`. The third preset should appear. Open a
note with none — it should go. This is a smoke check; the full pass is T08.

`npm run test:live` is **not** required here: this task changes what is inside a
message, not the SDK options or the permission decisions, which are what that test
exists to catch.

- [ ] **Step 13: Commit**

```bash
git add src/chat/ChatView.tsx src/chat/components.tsx
git commit -m "feat: the chat follows the note you are reading"
```

Remember the `Co-Authored-By:` trailer from `../shared/conventions.md`.

## Acceptance Criteria
- [ ] `npx tsc --noEmit` is clean
- [ ] `npx vitest run` passes in full
- [ ] `npm run build` completes and writes `main.js`
- [ ] The preset appears and disappears as you move between notes in the dev vault
- [ ] `getState()` is unchanged — `announced` is not persisted
- [ ] The transcript shows what was typed, with no note line in it
- [ ] No files outside Scope were modified
