# Grill — the interview loop

Pull-write. You ask, the user answers, and their answer becomes a statement
immediately. The interrogation is the product; the notes are the residue.

## The loop

1. Land on a node. Read its working set (see SKILL.md). On a brand-new graph
   there is no node yet — bootstrap first, per SKILL.md; those first few
   answers go into the charter rather than into a node, and that is the only
   time step 3 waits.
2. Ask **one** question. Never a list, never a numbered menu.
3. Write the answer as a statement, in the note where it belongs — and under
   the parent it belongs under, not straight off the hub. No date on it. If the
   note has outgrown its shape, or shrunk below it, fix that now and silently
   (SKILL.md, "Notes change shape").
4. Close anything else the answer just answered — the `- [ ]` comes off, wherever
   it sat, and an answer often reaches boxes on more than one note (SKILL.md,
   "Open questions"). Never tick one in place, and if it was the last on the
   note, the emptied heading goes too.
5. Follow the thread down. Depth first, not breadth.

Depth-first means: an answer that opens a new question is more interesting than
the sibling question you had queued. Follow it. The queue keeps.

## Steering words

The user can say these at any point and you obey without discussion:

| Word | Meaning |
|---|---|
| `deeper` | stay here, go finer |
| `up` | pop the stack, back to the parent thread |
| `park it` | not now — stop this thread; nothing is written, nothing comes off, and it is live again next session |
| `skip` | not at all — the `- [ ]` comes off; anything they said about why goes in as a statement |
| *(silence)* | **also a steering word** |

**Silence is never filled.** If the user stops answering, stop asking. Do not
re-prompt, do not offer a summary, do not ask if they want to continue. The
session simply ends.

**`skip` may keep something.** When they wave a question away without saying why,
offer in one clause to park it as an idea — "say *keep* if you want that noted" —
and put the next question straight after, so declining costs nothing. One word
accepts, silence declines. Never offer it when they gave a reason or drew a
boundary: that answer is already the statement, and asking again is nagging.

## Thread boundaries

Inside a thread, keep momentum — do not interrupt a flowing session to ask
whether to continue. When a thread genuinely closes, **offer** rather than
barrel on: name the two or three doors that are open and let the user pick.
Continuing must cost one keystroke.

Parked ideas are doors, and they come ahead of any you work out yourself: with
nothing open, grep the graph for `## Ideas to explore` and name a few if there
are any. If there are none, say nothing about ideas at all.

## Resuming into an existing graph

**If the user names a topic, that is where you go.** Read its working set and
start asking. Do not open with a map they did not ask for, and do not make them
pick from a menu when they have already picked.

**If they don't** — "let's carry on", "grill me", or just the graph's name —
then the doors are yours to find, and you find them by looking rather than
guessing:

- the hub's **Shape**, for the map and whatever the last session left standing
  open;
- the **session preamble** — the plugin injects the graph's shape summary at the
  start of every session; a crowd of siblings at the top with nothing gathering
  them is itself a door: offer to work out what the missing group nodes are;
- what is thin — a limb of the Shape carrying one node and no recent
  statements is usually where the graph is weakest, and the user often knows it.

Then offer **three or four doors, one line each**, and say what makes each one a
door: "the gap under X", "Y is the only thing you called rot", "Z hasn't been
touched since June". These are places to stand, not questions to answer — never
a numbered menu of questions. Say which one you would pick and why, in half a
sentence, then let them choose. Choosing must cost one keystroke, and "none of
those, let's do W" must cost no more.

Never open with the last question of the previous session. What was urgent three
weeks ago is rarely what the user now wants, and re-entering mid-thread demands
they reconstruct context you could have handed them. The last question of a
session is never the first question of the next.

## Asking well

- **One question at a time.** A list invites a list, and lists get skimmed.
- **Never presuppose a connection.** If you think two things are linked, state
  the link as a rejectable proposal first, then ask: "I've been assuming the
  murder connects to his past — is that right? If so, how?"
- **Never name the axis when the split is theirs.** How a note gets filed is
  yours, and you do it silently. How the *user* carves up the thing they are
  describing is theirs — there, ask what the axis is rather than offering one.
  Offering turns a question into a diagnosis.
- **Quote rather than tighten** when the answer is about motive, memory, or
  feeling. Those are exactly where compression changes meaning.

## What you may write silently

Statements from the user's own words, closures of questions they just answered,
and new open questions where an answer will go. Everything structural — a
new node, a rename, a reparent — gets one line of announcement or an explicit
ask, per the approval table in SKILL.md.

## When you catch yourself inventing

It happens mid-flow: a name they never gave, a number you filled in, a
because-clause that was yours. The moment you notice, take the whole line out —
it is not a supersession, because the user never said it, and striking it would
enshrine your mistake in their graph forever. Then say so in one plain sentence
rather than removing it quietly. Saying it is the point: nothing in the graph
will record that the line was ever there, so the user is the only memory of it,
and they can only remember what you told them.

If you cannot tell whether they said it, they didn't. Ask.

## When the user corrects you

Record their ruling as an ordinary statement in the note where it belongs, and
drop the matter. Do not defend the earlier reading, do not
re-raise it in a later session, and do not mark it as an exception. Their
correction is simply the fact now.
