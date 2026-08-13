# Task T03: A message carries its note

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md`
- Read: `../shared/conventions.md`
- Read: `../../knowledge/run-tests.md`
- Read: `../../knowledge/commit.md`

## Dependencies
- Depends on: — (none)
- Depended on by: T07 (chat wiring)

## Scope
**Files:**
- Modify: `src/chat/queue.ts`
- Modify: `tests/chat-queue.test.ts`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Why this is a field and not a lookup at send time

A message queued while you were reading note A should still *mean* note A when it
finally goes out, even if you wandered off to note B during the turn. Reading the
active note at send time would silently retarget exactly the messages this feature
exists to serve. So the note is captured when the message is composed and travels with
it — through the wait, through a cancel, through a resend.

## Positive Constraints (DO)
- Add one optional field to `Outgoing`. `Queued extends Outgoing`, so it inherits.
- Fix `advance()` to carry `note` onto the object it returns in `send`. It currently
  rebuilds that object from `text` and `label` only, which would drop the new field
  silently — this is the actual bug in the task, not the interface change.

## Negative Constraints (DO NOT)
- Do NOT make `note` required. Most messages are composed with no note open in this
  tab's project, and `undefined` is the honest value for that.
- Do NOT resolve, normalise or validate the path here. `queue.ts` is a list; it has no
  business knowing what a vault is.
- Do NOT touch `setCanceled`, `cancelAll` or `hasWaiting` — they spread whole objects
  and already carry any field you add.

## Implementation Steps

- [ ] **Step 1: Write the failing tests**

Append to `tests/chat-queue.test.ts`:

```typescript
describe("advance — a message keeps the note it was written about", () => {
  const about = { text: "answer the second one", note: "Fiction/Solaris/The contact.md" };

  it("carries the note out with a message that goes straight to the agent", () => {
    expect(advance([], false, about).send).toEqual(about);
  });

  it("carries the note out with a message that had to wait its turn", () => {
    // Written while reading one note, released a turn later — possibly while the
    // user is reading something else entirely. It still means the note it meant.
    expect(advance([{ ...about, canceled: false }], false).send).toEqual(about);
  });

  it("keeps the note through a cancel and a resend", () => {
    const queue = setCanceled([{ ...about, canceled: false }], 0, true);
    expect(advance(queue, false).send).toBeNull();
    expect(advance(setCanceled(queue, 0, false), false).send).toEqual(about);
  });

  it("leaves a message composed with no note open without one", () => {
    expect(advance([], false, typed("what happens in act two?")).send?.note).toBeUndefined();
  });
});
```

- [ ] **Step 2: Run them to make sure they fail**

Run: `npx vitest run tests/chat-queue.test.ts`
Expected: FAIL. The first three fail on the returned object missing `note`. Your editor
will also flag `Object literal may only specify known properties` where `about` is
passed to `advance` — that is the same missing field, seen by the compiler first.

- [ ] **Step 3: Add the field**

In `src/chat/queue.ts`, inside `interface Outgoing`, after `label`:

```typescript
  /**
   * The note this was composed against — what it is *about*, when the user wrote
   * it while reading something. Absent when no note of this project was open.
   *
   * Captured when the message is written rather than when it goes out, so a
   * message queued behind a turn still means the note it meant, however far the
   * user has wandered by the time it is said.
   */
  note?: string;
```

- [ ] **Step 4: Carry it through `advance`**

In `src/chat/queue.ts`, the last line of `advance` currently reads:

```typescript
  return { queue: waiting.filter((_, i) => i !== next), send: { text: front.text, label: front.label } };
```

Replace it with:

```typescript
  return {
    queue: waiting.filter((_, i) => i !== next),
    send: { text: front.text, label: front.label, note: front.note },
  };
```

- [ ] **Step 5: Run them to make sure they pass**

Run: `npx vitest run tests/chat-queue.test.ts`
Expected: PASS, including every test that was already there.

The older assertions keep passing because `toEqual` ignores properties whose value is
`undefined`. If you find yourself tempted to change one of them, stop — that would mean
you have changed behaviour rather than added a field.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 7: Commit**

```bash
git add src/chat/queue.ts tests/chat-queue.test.ts
git commit -m "feat: a message remembers which note you wrote it about"
```

Remember the `Co-Authored-By:` trailer from `../shared/conventions.md`.

## Acceptance Criteria
- [ ] `npx vitest run tests/chat-queue.test.ts` passes, old tests untouched
- [ ] `npx tsc --noEmit` is clean
- [ ] `Outgoing.note` is optional and documented
- [ ] `advance()` returns `note` on the message it releases
- [ ] No files outside Scope were modified
