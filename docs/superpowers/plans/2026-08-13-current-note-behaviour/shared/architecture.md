# Architecture

## The one idea

The interviewer runs as a separate `claude.exe` process with file tools. It cannot see
the Obsidian window, so it only knows which note is open if the plugin says so.

Rather than two mechanisms — a path baked into the preset's text, plus something else
for typed messages — there is **one channel**:

1. Every outgoing message carries the note it was composed against (`Outgoing.note`).
2. `pump()` compares that against what this conversation has already been told and
   prepends one line when they differ.
3. The preset's prose therefore says "the note I am looking at" and always resolves,
   because pressing the button carries the note, which fires the announcement if the
   interviewer does not already know it.

## Module boundaries

- `src/open-questions.ts` — pure. Counts `- [ ]` lines in a note body. Shared by the
  mindmap and the composer, which is why it left `src/mindmap/`.
- `src/chat/note-context.ts` — pure. Decides *whether* to announce and *what to say*.
  Holds no state; the caller owns `announced`.
- `src/chat/presets.ts` — pure. Decides which buttons the row holds.
- `src/chat/queue.ts` — pure. Now carries one more field, unchanged in behaviour.
- `src/main.ts` — Obsidian plumbing. Resolves the active file to a note-in-this-graph.
- `src/chat/ChatView.tsx`, `src/chat/components.tsx` — shells. No decisions.

That split is the project's standing rule, stated in `CLAUDE.md`: "every decision
belongs in a pure TDD'd module beside the shell, never in the shell." Nothing in this
feature is an exception.

## Design decisions worth not re-litigating

**A note in another project counts as no note.** A chat tab is bound to one graph, and
`src/agent/permissions.ts` is fail-closed about paths outside it. Pointing a tab at
another project's note is exactly the thing that table forbids, so the preset hides and
the announcement says the user has left.

**The note is captured when the message is composed, not when it is sent.** A message
queued while you read note A still means note A when it goes out forty seconds later,
even if you have wandered off during the turn. That is the case the feature exists for.

**`announced` is live state, never persisted.** It sits on `Runtime` in `ChatView`,
which is dropped on reload. So the first message of a *resumed* conversation
re-announces the note — correct, because a resumed session may have been compacted.

**The count never reaches the model.** It decides whether a button exists. The
interviewer reads the note itself when pressed, so its view is never staler than the
file. This preserves the promise written at the top of `presets.ts`: a preset computes
nothing about the graph.

**The transcript is untouched.** The announcement is plumbing, like the session
preamble. What the panel shows is what you said.
