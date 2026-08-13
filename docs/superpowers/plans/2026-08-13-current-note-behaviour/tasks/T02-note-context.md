# Task T02: Note announcement

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
- Create: `src/chat/note-context.ts`
- Create: `tests/chat-note-context.test.ts`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Keep the module pure: it holds no state, opens no files, imports nothing from
  Obsidian. The caller owns `announced` and updates it.
- Use the two exact strings from `../shared/interfaces.md`.
- Cover all five rows of the table below plus the return-to-a-note case.

## Negative Constraints (DO NOT)
- Do NOT put the "resolve against this note first" instruction into the announcement.
  That rule belongs in `assets/prompts/system.md` and is T05's job — repeating it on
  every note switch is noise the interviewer already has.
- Do NOT import anything from `obsidian`, `./ChatView` or `./components`.
- Do NOT add a class, a store, or anything holding `announced` inside this module.

## The rule, in full

| `open` | `announced` | result |
| --- | --- | --- |
| `"A"` | `undefined` | announce A — the first message of a conversation |
| `"A"` | `"A"` | `null` — it already knows |
| `"B"` | `"A"` | announce B — the user switched |
| `null` | `"A"` | say the user has left |
| `null` | `undefined` | `null` — no opening line about nothing |
| `null` | `null` | `null` — already said they left, nothing new |
| `"A"` | `null` | announce A — they came back |

The caller's half of the contract: set `announced = open` whenever a line came back, and
leave it alone otherwise. That single rule makes every row above consistent.

## Implementation Steps

- [ ] **Step 1: Write the failing test**

Create `tests/chat-note-context.test.ts`:

```typescript
import { describe, it, expect } from "vitest";
import { noteAnnouncement } from "../src/chat/note-context";

const A = "Fiction/Solaris/The contact.md";
const B = "Fiction/Solaris/Kelvin.md";

describe("noteAnnouncement", () => {
  it("names the note on the first message of a conversation", () => {
    expect(noteAnnouncement(A, undefined)).toBe(
      "The user is looking at `Fiction/Solaris/The contact.md`. It is context for you, never content.",
    );
  });

  it("says nothing while the user stays on the same note", () => {
    expect(noteAnnouncement(A, A)).toBeNull();
  });

  it("names the new one when the user switches notes", () => {
    expect(noteAnnouncement(B, A)).toContain("Kelvin.md");
  });

  it("says the user has left, so a closed note stops pulling every answer toward it", () => {
    expect(noteAnnouncement(null, A)).toBe("The user is not looking at any note in this graph.");
  });

  it("opens with nothing when there was no note to begin with", () => {
    expect(noteAnnouncement(null, undefined)).toBeNull();
  });

  it("does not repeat that the user has left", () => {
    expect(noteAnnouncement(null, null)).toBeNull();
  });

  it("names the note again when the user comes back to it", () => {
    expect(noteAnnouncement(A, null)).toContain("The contact.md");
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/chat-note-context.test.ts`
Expected: FAIL — `Failed to resolve import "../src/chat/note-context"`.

- [ ] **Step 3: Write the module**

Create `src/chat/note-context.ts`:

```typescript
/**
 * Telling the interviewer which note the user is reading.
 *
 * It runs as a separate process with file tools and no view of the Obsidian
 * window, so it knows what is on screen only because the panel says so. Saying it
 * on every message would be a line of plumbing stapled to everything you type; so
 * the panel says it once, and again whenever the answer changes — the way you
 * would mention to a person that you have turned to a different page.
 *
 * What the interviewer does with that knowledge is in `assets/prompts/system.md`,
 * not here. This module decides only whether there is anything new to say.
 *
 * Nothing is remembered here. The caller holds what it has already said, because
 * that fact belongs to one conversation and this file serves all of them.
 */

const AWAY = "The user is not looking at any note in this graph.";

/**
 * The line to put in front of the next message, or null when what the
 * interviewer already believes is still true.
 *
 * `announced` is what this conversation has been told so far — `undefined` when
 * nothing has been said yet, which is why a conversation that opens with no note
 * open opens with no line about it either.
 *
 * The caller sets `announced` to `open` whenever a line comes back, and leaves it
 * alone otherwise.
 */
export function noteAnnouncement(open: string | null, announced: string | null | undefined): string | null {
  if (open === announced) return null;
  if (open === null) return announced === undefined ? null : AWAY;
  return `The user is looking at \`${open}\`. It is context for you, never content.`;
}
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run tests/chat-note-context.test.ts`
Expected: PASS, 7 tests.

- [ ] **Step 5: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output.

- [ ] **Step 6: Commit**

```bash
git add src/chat/note-context.ts tests/chat-note-context.test.ts
git commit -m "feat: the interviewer is told which note you are reading"
```

Remember the `Co-Authored-By:` trailer from `../shared/conventions.md`.

## Acceptance Criteria
- [ ] `npx vitest run tests/chat-note-context.test.ts` passes, 7 tests
- [ ] `npx tsc --noEmit` is clean
- [ ] The module imports nothing from `obsidian` and holds no module-level mutable state
- [ ] Both announcement strings match `../shared/interfaces.md` character for character
- [ ] No files outside Scope were modified
