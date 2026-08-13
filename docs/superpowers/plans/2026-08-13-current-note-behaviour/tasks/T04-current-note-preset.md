# Task T04: The preset

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md`
- Read: `../shared/conventions.md`
- Read: `../../knowledge/run-tests.md`
- Read: `../../knowledge/commit.md`
- Read: `assets/prompts/presets/ask-me.md` — the voice the new prompt has to match
- Read: `assets/prompts/system.md`, section `## Open and closed questions` — how closing
  actually works, which the prompt must not restate differently

## Dependencies
- Depends on: — (none)
- Depended on by: T07 (chat wiring)

## Scope
**Files:**
- Create: `assets/prompts/presets/current-note-questions.md`
- Modify: `src/chat/presets.ts`
- Modify: `tests/chat-presets.test.ts`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## Positive Constraints (DO)
- Write the prompt as prose with **no placeholder and no interpolation**. It says "the
  note I am looking at" and that resolves, because the message carrying it also carries
  the note — see `../shared/architecture.md`.
- Append the note preset **after** the two static ones, so `Ask me` and `Summarize`
  keep fixed positions as the row grows and shrinks under the cursor.
- Keep the module pure. It takes a number and returns buttons.

## Negative Constraints (DO NOT)
- Do NOT put a note path, a count, or any other graph fact into the preset's text. The
  interviewer reads the note itself; a baked-in inventory is what the module's opening
  comment exists to forbid.
- Do NOT restate the closing convention in the prompt. `system.md` owns it; two
  descriptions of one rule will drift.
- Do NOT put the count in the button's label. That was considered and dropped — the row
  would jitter, and the map already answers "how much".
- Do NOT make `visiblePresets` read the vault, take a path, or become async.

## Implementation Steps

- [ ] **Step 1: Write the failing test**

Append to `tests/chat-presets.test.ts`, and add `visiblePresets` to the import on
line 2:

```typescript
describe("visiblePresets", () => {
  it("offers only the two standing presets when the note asks nothing", () => {
    expect(visiblePresets(0).map((p) => p.id)).toEqual(["ask-me", "summarize"]);
  });

  it("offers the note's questions as soon as it owes one", () => {
    expect(visiblePresets(1).map((p) => p.id)).toEqual(["ask-me", "summarize", "note-questions"]);
  });

  it("puts the note preset last, so the two standing ones never move under the cursor", () => {
    // The row grows and shrinks as you walk around the vault. Whatever is always
    // there has to stay where it was.
    expect(visiblePresets(7).at(-1)?.id).toBe("note-questions");
    expect(visiblePresets(7).slice(0, 2)).toEqual(visiblePresets(0));
  });

  it("gives the note preset a label, a tooltip and something to say", () => {
    const preset = visiblePresets(1).at(-1)!;
    expect(preset.label).toBe("Current note questions");
    expect(preset.title.trim()).not.toBe("");
    expect(preset.prompt.trim()).not.toBe("");
  });

  it("issues the note preset its own id, so the row redraws when it appears", () => {
    expect(new Set(visiblePresets(3).map((p) => p.id)).size).toBe(3);
  });
});
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/chat-presets.test.ts`
Expected: FAIL — `visiblePresets is not a function` / no exported member.

- [ ] **Step 3: Write the prompt**

Create `assets/prompts/presets/current-note-questions.md`:

```markdown
Work through the open questions on the note I am looking at.

Read that note. Take its `## Open questions` in the order they are written and ask
me the first one — in your own words, with whatever I need in front of me to answer
it, and nothing else alongside. Then wait.

When I answer, close that question the way closing works, and ask me the next one.
Keep going until the section is empty or I stop you.

Do not invent questions to fill the section out, and do not wander off into another
note's. If the note's questions turn out to be answered already in its own body, say
so and close them rather than asking me again.
```

- [ ] **Step 4: Add the preset and the function**

In `src/chat/presets.ts`, add the import beside the other two, at the top:

```typescript
import currentNoteQuestionsMd from "../../assets/prompts/presets/current-note-questions.md";
```

Then, after the `DIALOG_PRESETS` declaration, add:

```typescript
/**
 * The one preset that is not always there: it needs a note in front of you with
 * something still open on it.
 *
 * It is kept out of `DIALOG_PRESETS` rather than filtered out of it, because that
 * array is the row you can always count on — and everything downstream, from the
 * React keys to the panel's saved state, reads better when "always" means always.
 */
const NOTE_QUESTIONS: DialogPreset = {
  id: "note-questions",
  label: "Current note questions",
  title: "Work through this note's open questions, one at a time",
  prompt: currentNoteQuestionsMd,
};

/**
 * The row as it stands right now, given what the note in front of you still owes.
 *
 * The count decides whether a *button* exists and goes no further — it is never
 * sent, never quoted, never handed to the interviewer, which reads the note itself
 * and is therefore never working from a staler number than the file. That is the
 * promise at the top of this file kept rather than bent.
 */
export function visiblePresets(openQuestions: number): readonly DialogPreset[] {
  return openQuestions > 0 ? [...DIALOG_PRESETS, NOTE_QUESTIONS] : DIALOG_PRESETS;
}
```

- [ ] **Step 5: Run it to make sure it passes**

Run: `npx vitest run tests/chat-presets.test.ts`
Expected: PASS, including the existing `DIALOG_PRESETS` block — which still asserts
exactly two ids, and must keep doing so.

- [ ] **Step 6: Typecheck**

Run: `npx tsc --noEmit`
Expected: no output. If it complains about the `.md` import, check that the new file is
under `assets/prompts/presets/` — the `*.md` module declaration and the esbuild loader
both key off the extension, not the path, so a typo in the filename is the likely
cause.

- [ ] **Step 7: Commit**

```bash
git add assets/prompts/presets/current-note-questions.md src/chat/presets.ts tests/chat-presets.test.ts
git commit -m "feat: the composer offers to work through this note's questions"
```

Remember the `Co-Authored-By:` trailer from `../shared/conventions.md`.

## Acceptance Criteria
- [ ] `npx vitest run tests/chat-presets.test.ts` passes, old tests untouched
- [ ] `npx tsc --noEmit` is clean
- [ ] `DIALOG_PRESETS` still holds exactly `ask-me` and `summarize`
- [ ] The prompt file contains no path, no count, and no `{{placeholder}}`
- [ ] No files outside Scope were modified
