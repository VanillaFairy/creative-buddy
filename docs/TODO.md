# TODO — feature backlog

Ideas that are wanted but not yet planned. Nothing here is committed to a
milestone; a plan or spec gets written when an item is picked up.

For deferred *defects* and known traps from the original build, see
`docs/superpowers/plans/progress/2026-08-11-graph-buddy-plugin-checkpoint.md`
(the "Open items" section) instead.

---

## Say when a conversation has got expensive

Watch what a conversation has cost so far, and when it crosses a threshold, tell
the user it is probably time to start a fresh one.

The reason this is worth doing — and the reason it is cheap — is that starting
over costs the user nothing here. Everything said has already been filed into
notes; the transcript is a record of the interview, not the knowledge. A new
conversation on the same graph picks up with the same shape and the same facts,
just without dragging the whole back-and-forth along. That is the files-are-the-
state principle paying out, and most chat tools cannot offer it.

What makes a long conversation expensive is that every turn re-sends a
transcript that only grows. So cost per turn climbs even when the questions stay
the same size, and past some point the user is paying to re-read an interview
rather than to continue it.

**The number is already in hand.** `total_cost_usd` arrives on every result
message and `AgentService` already surfaces it (`agent-service.ts:314` →
`onResult`), `ChatView` already dispatches it (`ChatView.tsx:324`), and the
transcript already carries it as a `result` item. Nothing new has to be
measured. The work is the threshold, the notice, and the wording.

**Read the cumulative caveat first.** Per the SDK reference
(`docs/superpowers/research/2026-08-11-agent-sdk-reference.md`, "Cost/token
accounting"), `total_cost_usd` is **cumulative across turns** in a
streaming-input session — which is the mode this plugin runs in — so the
conversation total is the latest result's value, and summing the turn rules
would over-count badly. This also means the per-turn cost line may be showing
the running total labelled as the turn's own cost; that is logged as a suspected
defect in the checkpoint's open items and wants confirming before this feature
is built on top of it.

### Where it plugs in

- A pure module beside the chat — `src/chat/cost-alert.ts` or similar — deciding
  from the running total and the threshold whether to warn, and warning only
  once per conversation rather than on every turn past the line. House pattern:
  the decision gets its own module and its own test, never the shell.
- `src/chat/transcript.ts` — the nudge is a notice item, the same shape "The
  session ended…" already uses, so it renders as machinery behind a rail rather
  than as the interviewer talking.
- `src/chat/ChatView.tsx` — dispatch only, no decision.

### Still open

- **What the threshold is measured in.** Dollars is the obvious unit and the one
  already on screen, but on a subscription no dollars are actually spent — the
  figure is what it would have cost on API billing. The real signal might be
  context size (the SDK's `modelUsage` carries `inputTokens` and `contextWindow`,
  so "you are at 70% of the window" is available and is arguably the more honest
  warning). Dollars are easier to explain; tokens are closer to the truth.
- **Whether the SDK will do this for us.** There is an `error_max_budget_usd`
  result subtype in the SDK types, which implies a budget option exists
  somewhere. Worth checking before writing our own accounting — though note a
  hard cap that *ends* the session is a different thing from a nudge that
  suggests starting a new one.
- **What the notice offers.** Telling someone a conversation is expensive
  without giving them the next step is a scold. It probably wants to be an
  offer — a "start a fresh conversation on this graph" affordance, which is the
  "+" on the tab strip plus the current graph.
- **Whether it can be dismissed for the rest of a conversation**, and whether a
  second warning ever fires after that.

## Plugin settings for the cost threshold

The settings tab already exists — `CreativeBuddySettingTab` in `src/settings.ts`,
carrying the Claude Code path, the panel location, the default model, the API key
override and the health check. This adds the threshold to it: one more field on
`CreativeBuddySettings` with a default in `DEFAULT_SETTINGS`, read by whatever
decides to warn.

Keeping it here rather than per-conversation matches how the default model
already works: settings seed behaviour, and the conversation is where you
deviate from it.

### Still open

- **What switches it off.** Empty or zero reading as "never warn" is the usual
  shape and needs no extra toggle.
- **Whether a conversation can override it.** Probably not worth it — the map's
  Heat switch is per-view state because it is a way of *looking*; a spend
  threshold is a preference, and preferences live in settings.
- **What the default is.** It should be high enough that a normal interview
  never trips it, or the warning becomes noise people learn to ignore. Nobody
  has measured what a normal interview costs yet; the per-turn cost line is the
  place that answer will come from, once it is known to be reporting the right
  number.

## Resources — images, PDFs, everything that is not a note

The graph is markdown-only from end to end. The vault feed drops anything whose
extension is not `md` (`src/main.ts:61`), discovery only counts `.md` when
deciding what a graph even is (`src/graph/discovery.ts:71`), and the composer
has no way to take an attachment at all. So a reference image, a scanned brief, a
screenshot of a whiteboard — the raw material a lot of creative work actually
starts from — has nowhere to go. You can describe it to the interviewer, but you
cannot show it.

Two halves, and they come apart cleanly:

**Reading a resource.** Point the interviewer at a picture or a PDF and let it
work from what it sees, filing what it learns into notes exactly as it does with
anything said out loud. For a file already sitting in the vault this may be
close to free — Claude Code's `Read` handles images and PDFs, and the permission
table already allows `Read` anywhere in the vault outside hidden folders
(`src/agent/permissions.ts:133`), so the missing piece is a way to name the file
in a message rather than any new plumbing. A file from *outside* the vault is
the harder half: it has to land somewhere first, and that is a write.

**Keeping a resource.** A note that embeds an image (`![[cover.png]]`) is
ordinary Obsidian and costs nothing — the note stays the node, the picture is
just part of it. Whether a resource ever becomes a node in its own right, with
an identity on the map and links of its own, is a separate and much less obvious
question.

### Still open

- **Where an incoming file lands.** Obsidian has an attachment-folder setting,
  which is where a user expects things to go, but honouring it scatters a
  graph's material outside the graph's own folder — and writes outside the bound
  graph currently stop for approval (`src/agent/permissions.ts:151`). Keeping
  attachments inside the graph folder is tidier for us and stranger for the user.
- **Whether the map shows them.** Heat counts open questions (`- [ ]`) per note;
  an image has none to count and would sit permanently cold, which reads as
  "nothing owed here" when the truth is "not that kind of thing". Either
  resources stay off the map, or the map learns a second kind of node.
- **Whether the graph core has to change at all.** `src/graph/` is a
  line-faithful port of `oracle/*.py`, which knows only markdown. If non-`.md`
  files become part of the model, the Python moves first and the expected JSON
  regenerates — otherwise parity breaks. Embedding-only support avoids this
  entirely, which is a strong argument for starting there.
- **What it costs.** Images and PDFs are heavy in tokens, and the transcript is
  re-sent every turn (see the cost section above), so a PDF read once in the
  first minute keeps being paid for all conversation. That may argue for reading
  a resource, writing down what it said, and not carrying the resource itself
  any further.
