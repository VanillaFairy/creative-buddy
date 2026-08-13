# Task T05: The system-prompt rule

## References
- Read: `../shared/architecture.md`
- Read: `../shared/interfaces.md`
- Read: `../shared/conventions.md`
- Read: `../../knowledge/run-tests.md`
- Read: `../../knowledge/commit.md`
- Read: `assets/prompts/system.md`, the whole `## Dispatch — read the move` section
- Read: `src/agent/prompts.ts` — `buildSessionPreamble` phrases the date line the same
  way, and the two must read as one voice

## Dependencies
- Depends on: — (none)
- Depended on by: — (none; T07 works whether or not this has landed, it just works
  better)

## Scope
**Files:**
- Modify: `assets/prompts/system.md`
- Modify: `tests/prompts.test.ts`

**BOUNDARY — you MUST NOT modify any files outside this list.**

## What this task is for

T02 makes the panel *say* which note is open. This task is the other half: teaching the
interviewer what that line means and what to do about it. Without it, the line arrives
and is treated as an odd remark.

## Positive Constraints (DO)
- Put the block at the end of `## Dispatch — read the move`, directly after the line
  `Do not announce the mode. Just behave that way.` That section is about reading the
  user's move, which is exactly what this changes.
- Match the surrounding voice: bold lead-in, plain sentences, a concrete example.
- Say explicitly that the line is context and never content — the same footing the date
  line has in the session preamble, and for the same reason.

## Negative Constraints (DO NOT)
- Do NOT add a new `## ` heading. This is a block inside an existing section; a new
  heading would show up in the stitched document's shape and invite a subsection.
- Do NOT weaken the graph-sealing rule. The open note is always inside the bound graph
  — the plugin guarantees it — so nothing here licenses reading another graph's folder.
- Do NOT contradict `## Open and closed questions`. Answering still closes a question
  the same way it always did.

## Implementation Steps

- [ ] **Step 1: Write the failing test**

Append to the `describe("shipped prompt assets", …)` block in `tests/prompts.test.ts`:

```typescript
  /**
   * The panel says which note is open (src/chat/note-context.ts). This is the
   * other end of that wire: without the rule, the line arrives as an odd remark.
   */
  it("system prompt says what an open-note line means", () => {
    expect(systemPrompt).toContain("**The note the user is reading comes first.**");
    expect(systemPrompt).toContain("The user is looking at");
    expect(systemPrompt).toContain("context for you, never content");
  });
```

- [ ] **Step 2: Run it to make sure it fails**

Run: `npx vitest run tests/prompts.test.ts`
Expected: FAIL on the first `toContain`.

- [ ] **Step 3: Write the rule**

In `assets/prompts/system.md`, find these lines at the end of
`## Dispatch — read the move`:

```markdown
Do not announce the mode. Just behave that way.
```

Insert directly beneath them, before the `## Bootstrap — when there is no graph yet`
heading:

```markdown
**The note the user is reading comes first.** A line may precede a message saying
`The user is looking at ...`, naming a note in this graph. It is context for you,
never content: it never becomes a statement, it is never written into a note, and
the fact that they had a file open is not a fact about the subject. What it changes
is where you look. Take what they say as being about that note, and widen to the
rest of the graph only when it plainly is not — "answer the second one" means the
second question on that note, and "what did we decide about the ending?" asked over
a character note is still about the ending.

The line arrives once and stands until it is replaced. When it says the user is not
looking at any note, or none has arrived at all, work from the graph as a whole the
way you always have.
```

- [ ] **Step 4: Run it to make sure it passes**

Run: `npx vitest run tests/prompts.test.ts`
Expected: PASS, including the vocabulary block further down the file — that block
holds the line on words that have drifted before, so if it goes red, a word in the new
text is the wrong one. Read the failure; it names the offender.

- [ ] **Step 5: Run the docs suite**

Run: `npx vitest run tests/docs-questions.test.ts`
Expected: PASS. `system.md` is not under `docs/`, so this is a cheap guard rather than
a real risk — but the repo's docs are tested, and it costs a second.

- [ ] **Step 6: Commit**

```bash
git add assets/prompts/system.md tests/prompts.test.ts
git commit -m "feat: what you say is about the note in front of you first"
```

Remember the `Co-Authored-By:` trailer from `../shared/conventions.md`.

## Acceptance Criteria
- [ ] `npx vitest run tests/prompts.test.ts` passes in full
- [ ] The new block sits inside `## Dispatch — read the move`, adding no heading
- [ ] The rule states the line is context, never content
- [ ] No files outside Scope were modified
