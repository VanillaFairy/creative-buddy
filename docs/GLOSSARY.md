# Glossary

This project has a small, deliberate vocabulary, and almost all of it was
settled one module at a time — a header comment here, a prompt table there, a
design spec for the newest words. This is the one place it is written down:
what a word means here, and which file gets to decide.

## This document and the interviewer's words table

[`assets/prompts/system.md`](../assets/prompts/system.md) carries a table headed
"**The words.** Where two could name one thing, this is the one". It overlaps
this glossary and is not a duplicate of it.

The **words table** binds what the interviewer *says to the user*. Every row
names one thing and then lists the synonyms it must not reach for — "Not: entry,
item, page" — because its job is to stop a model drifting between two names for
one thing halfway through a conversation. A section spelled one way on eleven
notes and another way on five is one section with two addresses, and nothing
will ever find both.

This **glossary** serves someone reading the repository. It carries terms the
interviewer never sees — reach, band, lane, ring, the working set's boundary as
code rather than as instruction — and every entry says which module owns the
rule, so a word can be followed to the thing that enforces it.

Where a term is in both, they agree, and they are meant to go on agreeing. If
you find somewhere they have drifted apart, the drift is the bug; fix that
rather than editing one side to match.

## Graph shape

**graph** — A folder holding a note of its own name whose body carries a
`## Charter` heading. That is the entire test. There is no index, no cache and
no database: every reading recomputes from the files. A vault holds many graphs
and they are sealed from one another — another graph's kinds, status words and
note titles carry no authority here, and two graphs may hold notes with the same
title without that being a collision. Detected by `isGraphDir` and `findGraphs`
in [`src/graph/discovery.ts`](../src/graph/discovery.ts); which graph owns a
given note is [`src/graph/ownership.ts`](../src/graph/ownership.ts), which asks
the list of graphs rather than walking up the folder tree.

**hub** — The `<FolderName>.md` note at the top of a graph, the one carrying the
charter. It is the graph's root branch, so everything hangs off it eventually,
and it is the note a conversation is bound to. `hubPath` in `discovery.ts`.

**charter** — The `## Charter` block in the hub: the graph's own rules. What
kinds of thing it holds, what words the user uses for how settled something is,
what outside ground truth exists and how far it reaches, how fine a note should
be cut before it earns its own name. It is what makes a folder a graph, and
everything in it is graph-specific by design — the plugin's own prompt states no
kinds and no statuses of its own. Read it first, every session.

**Shape** — The hub's other reserved block, `## Shape`: a table of contents in a
handful of lines, naming the graph's big limbs and the two or three doors most
worth opening next. It holds no statements, which is why the interviewer may
rewrite it silently at the end of a session that changed the map. Not the same
as a graph's *shape* in the ordinary sense, and not the same as the `Shape:`
line in the session preamble, which reports note counts.

**branch** — A folder together with the note of its own name that speaks for it.
Everything in that folder hangs off that note. The word covers both ends of one
arrangement — the junction, and the subtree hanging off it — which is why it did
not need two words. Defined in the header of
[`src/graph/hierarchy.ts`](../src/graph/hierarchy.ts) and built by `hierarchyOf`.

**branch note** — The note a branch speaks through. It sits either *inside* the
folder (`References/References.md`) or *beside* it (`References.md` next to
`References/`), and inside wins when both exist. Moving it is what re-parents a
subtree: no note carries a `parent:` field, so the folder tree is the only
opinion there is. `speakerFor` in `hierarchy.ts`.

**plain folder** — A folder with no note of its own name. It is a filing
convenience rather than a generation, so the notes inside it pass up to the
nearest branch above and the folder itself never appears in the tree.
`hierarchy.ts`.

**limb** — A child of the hub, and everything under it: a branch of the first
generation. The word is about position rather than structure — the hub's
`## Shape` names the limbs and nothing deeper. Counted as `hubChildren` by
`statsOf` in `hierarchy.ts`.

**group node** — A branch note made to gather siblings under a role: a
`References` note over three reference notes, rather than three of them hanging
straight off the hub. Structurally it is an ordinary branch note. What makes it
a group node is why it exists — naming one is a filing decision the interviewer
makes silently, while what it *says* comes from the user or stays empty.
Defined in `system.md`.

> **branch, limb, group node.** *Branch* is structural: a folder and the note of
> its own name. *Limb* is positional: a branch of the hub's own generation.
> *Group node* is purposive: a branch note that exists to hold a set. A limb is
> a branch; a group node is a branch note; a branch is neither of the other two
> unless it also happens to sit where those words apply.

**node / note** — The same file, named from two sides. A **note** is the
Markdown file on disk; a **node** is that file seen as part of the graph. Not
every note is a node: anything under `Log/`, or inside a skipped tooling folder,
is a file in the graph's folder that the graph does not count. The split shows
up in code as two types — `Note` in
[`src/graph/notes.ts`](../src/graph/notes.ts) is one parsed index row (path,
stem, aliases, kind, status, colour, outgoing links), and `MindmapNode` in
[`src/mindmap/layout.ts`](../src/mindmap/layout.ts) is one drawn node, carrying
its children, its effective colour and its question counts.

**cross-link** — A wikilink between two notes that is not the parent edge: the
graph's second kind of edge, drawn without an arrowhead. Keyed on the unordered
pair, so two notes that link each other still get one arc between them rather
than two curves saying the same thing. Built in `buildMindmapData` in
`layout.ts`; drawn as a chord in radial mode by `crossLinkPath`.

**`Log/`** — A folder inside a graph holding session logs. Its files are notes
on disk and never nodes. `collectNoteFiles` in `discovery.ts` skips it, and
skips `.obsidian`, `.claude`, `.git`, `.trash` and `node_modules` for the same
reason: those hold somebody's tooling rather than somebody's notes.

**project** — What the user interface calls a graph. The chat and map pickers,
the tab titles and [`src/project-list.ts`](../src/project-list.ts) all say
"project", because "graph" means nothing to somebody choosing a folder out of a
list. It is the same thing, and `graphDir` is what actually gets bound.

## What a note holds

**statement** — One prose line in a note, recording a fact. It carries no
timestamp and no trace of the interview that produced it; read cold, a note
should look like prose a person wrote in one sitting. A statement lives in
**exactly one** note — a second note that needs it gets a wikilink, never a
copy, because two copies mean revising the thing that kills the fact leaves a
stale twin behind. Where it goes is settled by the killer test: the note whose
change would make it false. `system.md`.

**open question** — A `- [ ]` line under a note's `## Open questions` heading,
written on the note whose body will hold the answer rather than gathered into a
list somewhere. Answering one dissolves it: the answer becomes an ordinary
statement and the box comes off in the same edit. It is never ticked — a ticked
box renders struck through, so the note would show its settled facts as
crossed-out doubts. The map counts these, which is why the notation matters to
the code: `countOpenQuestions` in
[`src/open-questions.ts`](../src/open-questions.ts), which ignores boxes inside
code fences.

**idea** — A plain bullet under `## Ideas to explore`, naming a direction the
content could grow. Deliberately not a question: nobody is waiting on it,
nothing counts it, and it is never promoted into a box. That split is the whole
point of having two notations — `- [ ]` says the graph is waiting, `- ` says
only that a door exists. `system.md`.

**kind** — `kind:` in a note's frontmatter: a filing decision, made against the
list in that graph's charter. Every graph defines its own vocabulary and the
plugin has no opinion about any of it — a kind reaches the screen only as text
in the inspector strip. The single exception is `service`, below. Parsed in
`notes.ts`.

**status** — `status:` in a note's frontmatter: the user's own grading, in
whatever words the charter says they use. Unlike a kind it is a fact rather than
a decision, so it appears only when the user grades the thing. A note they have
not graded carries no `status:` at all, and filling one in by default would be
inventing a fact. Parsed in `notes.ts`.

**colour** — `color:` in a note's frontmatter: the colour the map paints that
note's dot, and everything below it, until a descendant asks for its own. Legal
values are `#rgb`, `#rrggbb`, or a CSS colour name; anything else is read as no
colour at all, so a typo takes whatever colour stands over it instead of
punching a grey hole in a coloured branch. Write it **quoted** — an unquoted `#`
opens a YAML comment and the value is gone before any of this code sees it. Like
a status and unlike a kind, it is the user's own mark and is never set unasked.
The grammar is [`src/graph/color.ts`](../src/graph/color.ts); the inheritance
walk is `toNode` in `layout.ts`; the design is
[the branch-colour spec](superpowers/specs/2026-09-11-branch-colour-design.md).

**alias** — A name in `aliases:` frontmatter that also resolves to this note.
Two jobs: a title that hides the real name, because titles are visible in the
file explorer before content is; and a name that has stopped being a filename —
a merged note's, an old title — so that every link which pointed at it still
lands. `nameResolutionMap` in `notes.ts` registers stems first and aliases
second, so a real stem always wins a collision.

**working set** — The notes the interviewer may read around the one it is
working on: the note itself, the hub for its charter, its parent branch note,
the notes it links out to, and its children. One hop in every direction. The
boundary is the point — widening it is how a session turns into a whole-graph
load — so anything wider goes to the scout instead. `system.md`.

**service node** — A note whose frontmatter says `kind: service` —
infrastructure rather than content, an `Images` folder rather than a chapter.
The map draws it as a dashed dot with its name beside it instead of a box, in
both views. It is the **only reserved kind**: every other `kind:` is defined by
a graph's own charter and the plugin ignores it, while `service` is read by the
renderer itself. It applies to the note that carries it, not to anything below
it. Defined in [`src/mindmap/service.ts`](../src/mindmap/service.ts).

## The map

**flat tree** — The map's default shape: a left-to-right tree of boxes, with the
hub as a title on a spine. It is the shape that can absorb a fold by pruning —
a folded branch leaves the tree entirely and everything below it closes the gap
upward, and nothing else moves. `paintCartesian` in
[`src/mindmap/MindmapView.tsx`](../src/mindmap/MindmapView.tsx), with every
sizing rule in [`src/mindmap/geometry.ts`](../src/mindmap/geometry.ts).

**radial** — The map's other shape, switched on per view: the hub at the centre
and each generation in a band around it, drawn as dots with captions. A circle
cannot absorb a fold by pruning — every note of a generation shares one ring, so
dropping a branch repacks the whole generation and the note you were reading
ends up somewhere else. So in radial the whole tree is laid out and the hidden
notes are simply left undrawn (`BuildOptions.prune` in `layout.ts`). Which way
round the circle each note lies is [`src/mindmap/radial.ts`](../src/mindmap/radial.ts);
how far out is [`src/mindmap/bands.ts`](../src/mindmap/bands.ts).

**heat** — A reading mode that colours every node by how many open questions it
still owes: eleven steps from green at none to red at ten or more. It is what
answers "where does this graph still owe me thinking?". Being a way of reading
the graph rather than a fact about it, it overrides a note's own colour while it
is on and hands it straight back when it goes off. The count-to-step mapping is
[`src/mindmap/heat.ts`](../src/mindmap/heat.ts); the eleven steps themselves are
declared in `styles.css`, once per theme.

**Highlight** — A way of reading the map around one note: right-click it, tick
**Highlight**, and everything not connected to it dims. **The Highlight
center** is the note you ticked it on; **in the Highlight** are the center and
its neighbours — its parent, its children, and every note it shares a
cross-link with — and every other note is **dimmed**. A note's neighbours are
read from the whole graph, so a fold is never opened for it: a folded branch
hiding a lit note is drawn lit as a stand-in for what it hides. Like heat it is
a way of looking rather than a fact recorded anywhere, so it is not saved —
switching project or restarting Obsidian leaves it off.
[`src/mindmap/highlight.ts`](../src/mindmap/highlight.ts) decides.

**fold / collapse** — Two words for one arrangement, worth keeping apart.
**Collapse** is the state — which notes the user has folded, remembered per
graph by [`src/mindmap/collapse-store.ts`](../src/mindmap/collapse-store.ts) and
saved with the view. **Fold** is what the map does about it: whether a node's
dot offers to collapse or to expand (`foldMark`), and how many notes a collapse
would hide (`hiddenIfFolded`), both in
[`src/mindmap/fold.ts`](../src/mindmap/fold.ts). A folded node says `+12` after
its name.

**caption** — A node's name in radial mode: the text beside the dot, with the
fold count after it. Captions never rotate, and that one fact is what the whole
radial layout is built around — near twelve o'clock a caption lies flat across
its band and takes its full width out of it, at three o'clock it points straight
down its own radius and takes none. `radialCaption` in `geometry.ts`.

**dot** — What radial mode draws a note as, and the branch control with it:
clicking the dot folds, clicking the name beside it opens the note, and
alt-click always opens. A leaf has nothing to fold, so clicking it opens too.
The hub gets a larger dot; a service node's is dashed, in both views.

**box** — What the flat tree draws a note as: a rounded rectangle with the name,
and, once the node is folded, a divider with the hidden count in its own area to
the right. `nodeBox` and `childRegionPath` in `geometry.ts`.

**spine** — The bar under the hub's title in the flat tree. The hub carries the
charter and everything hangs off it, so it is drawn as a title with a rule
rather than as one more box in the row of boxes. `HUB_HEIGHT` in `geometry.ts`,
`.cb-mm-hub-spine` in `styles.css`.

**band** — A generation's home in radial mode. A generation is a band rather
than a ring: its notes share a floor, and each takes the innermost lane that
clears everything already drawn, stepping outward when it cannot. That is worth
doing because a caption near the top of the circle is only a line deep, so one
lane of radius buys a whole neighbour's caption, while a caption out at three
o'clock costs the band nothing across and no lane would clear it anyway.
`placeBands` in `bands.ts`.

**lane** — One step outward inside a band, a line of text plus air apart. A
note's `lane` is which one it ended up in, counting from nought. `bands.ts`, and
`RadialNode.lane` in `radial.ts`.

**ring** — The circle a generation would need with every one of its notes at the
same radius. It is the loosest that generation ever gets and the yardstick every
tighter band is measured against — it is **not** where a note is drawn.
`RadialLayout.rings` records the ring a generation's bearings were reserved
against; `RadialNode.radius` is where `placeBands` actually seated the note,
which is usually nearer the hub. `radial.ts`.

**reach** — How far a node's ink extends from its own centre, as two numbers:
its dot radius and its caption width. It is what a band reserves room for and
what the drawing's bounds are measured from. `Reach` and `reachFor` in
`radial.ts`.

**inspector strip** — The line under the map that reads out whichever node is
under the pointer: its name, then its kind, its status, and what a fold is
hiding, when there are any. It falls back to a hint rather than showing a lone
stem the user is already looking at. `inspectorLine` in `geometry.ts`.

## The interviewer

**grill** — The interview mode, and the name of the prompt that defines it,
[`assets/prompts/grill.md`](../assets/prompts/grill.md). The interviewer asks
one question, writes the answer as a statement, closes whatever else that answer
just answered, and follows the thread down rather than across. What it does is
an interview; "grilling" is not the word.

**steering word** — One of a short list the user may say at any point and the
interviewer obeys without discussion: `deeper`, `up`, `park it`, `skip` — and
silence, which is also one of them. If the user stops answering, the session
simply ends; nothing re-prompts. `grill.md`.

**consult** — The mode for answering a question about the subject from the
notes: answer, cite, write nothing, and let the interview resume where it stood.
[`assets/prompts/consult.md`](../assets/prompts/consult.md).

**scout** — `kg-scout`, a read-only subagent dispatched with one question and a
folder scope when a look wider than the working set is worth paying for. It
returns a few sentences, never a file dump, which is what keeps a wide look from
becoming a wide load in the conversation that asked for it.
[`assets/agents/kg-scout.md`](../assets/agents/kg-scout.md), wired in
[`src/agent/kg-scout.ts`](../src/agent/kg-scout.ts).

**session preamble** — The per-session context the plugin computes and puts in
front of the model: which hub the conversation is bound to, today's date, and
how big the graph is. It is everything mechanical the model used to run scripts
for. `buildSessionPreamble` in [`src/agent/prompts.ts`](../src/agent/prompts.ts).
Its `Shape:` line reports counts and is unrelated to the hub's `## Shape` block.

**oracle** — [`oracle/graph_check.py`](../oracle/graph_check.py), the vendored
Python that everything in `src/graph/` is a line-faithful port of. It draws a
graph's tree, and `tests/expected/*.json` pin what it drew, so the two
implementations must agree on shape and on ordering both. Change the Python
first.
