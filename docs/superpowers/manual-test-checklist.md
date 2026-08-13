# Creative Buddy — manual test checklist

The unit suite proves the deterministic core; this pass proves the Obsidian
shells and the live interviewer. Run it top to bottom: dev vault first, then a
copy of the real vault, then the side-by-side parity items. Check items off as
they pass; note anything odd inline.

Setup: `npm run build && deploy.bat` (pass a path to target a vault other than
the default), enable the plugin, open the console (Ctrl-Shift-I) to catch stray
errors. Obsidian does not hot-reload — after each deploy, toggle Creative Buddy
off and on, and check the timestamps `deploy.bat` prints if behaviour looks
older than the code.

## 1 — Dev vault: chat

- [ ] There are exactly **two** ribbon icons — a speech bubble for the chat and
      a fork for the map. Either one opens its panel in the right sidebar;
      clicking it again reveals that same panel rather than stacking another.
      Collapse the sidebar first, then click → the sidebar reopens onto the
      panel rather than creating it out of sight. **Close the map, then click
      the map icon → it comes back.** That is the whole reason there are two.
- [ ] Open a note inside a project, then click the chat icon → a conversation
      opens already bound to that project, with no picker. It works from a note
      several folders deep, and from the hub note itself.
- [ ] Do the same with a note in a folder that has its own `## Charter` note
      **inside** an outer project → you land on the **outer** project, the one
      the map's dropdown also lists. (An inner one would be a project nothing
      else in the plugin can see.)
- [ ] Click the chat icon with no note open, or with a note that belongs to no
      project → on an empty strip the picker appears; with a conversation
      already open the panel is simply revealed and that conversation is left
      alone. The picker is the only question, and only when there is nothing to
      resolve.
- [ ] Right-click a note in the file explorer (or use its ⋯ menu) → "Open in
      Creative Buddy chat" and "Show in Creative Buddy map" sit with Obsidian's
      own open actions. Both resolve the project the same way the ribbon does.
      Right-click a **folder** or a non-markdown file → neither item appears.
- [ ] Click the chat icon three times from the same note → **one** conversation.
      The second and third clicks reveal the one you already have; they must not
      stack up tabs on the same project, and no ⚠ badge should appear.
- [ ] Talk in that conversation, then open a note in a **different** project and
      click the chat icon → a new tab on that project, with the first
      conversation still there, still bound to its own project and with its
      transcript intact. Click back to the first project's note and press the
      icon → you land back on the first conversation, not a fourth tab.
- [ ] Click the icon while you are already looking at that project's
      conversation → nothing changes at all (no tab switch, no redraw).
- [ ] Put the chat panel in the background (another sidebar tab in front of it),
      then click the chat icon → the panel comes forward **and** a conversation
      opens. A background panel holds a placeholder view, so this used to be a
      silent no-op.
- [ ] The "+" on the tab strip makes a second conversation **inside the same
      panel**. Bind it to another graph and talk in both: each tab keeps its
      own transcript, model, cost and session. A turn running in a background
      tab shows a pulsing dot on that tab.
- [ ] Close a middle tab → you land on the one that slid into its place;
      close the last tab in the strip → you land on the new last one. With one
      conversation left there is no close button at all.
- [ ] Closing a tab mid-turn does not throw, and its reply does not land in
      whichever conversation took its place.
- [ ] "New conversation" in the palette reveals the panel and adds a tab —
      except when the tab you are on is still blank and unused, which already
      is a new conversation. Unlike the ribbon it stays **unbound** and shows
      the picker even when you are standing in a project: it is the one command
      that always leaves you with a conversation you did not have, and how you
      reach a project other than the one you are reading. Same for the "+" on
      the strip — including a second tab on a project you already have open, if
      you deliberately ask for one. "Open chat panel" behaves like the ribbon.
      "Open graph mindmap" reveals the one map.
- [ ] Settings → "Open in the main editor area" → the next panel you open
      lands as a centre tab instead of in the sidebar. Panels already open
      stay where they are.
- [ ] **Upgrade path:** a vault whose `workspace.json` predates the tab strip
      opens its old conversation as tab one, transcript and session id intact
      — not a blank panel over the top of it.
- [ ] Open a chat panel, then run "Open graph mindmap" → the chat panel is
      **still there**. Opening the map must never take over the sidebar leaf a
      chat is sitting in; that silently ends the session.
- [ ] Open a chat panel from the ribbon; bind to a test graph; send a message on
      Haiku. Streaming text appears as plain text, then renders as markdown
      when the turn finishes; the tool machinery shows beneath it as activity
      panels, not one row per call.
- [ ] Ask for something that both looks around and files a note. Two panels
      appear: "Thinking…" then "Updating knowledge base…". Expand both while
      the turn is still running → lines appear live as calls land. When the
      turn settles the titles become "Thought for &lt;duration&gt;" and
      "Updated knowledge base", and a panel you left open stays open.
- [ ] A note the graph did not have before reads `X.md : added`; asking for a
      change to an existing note reads `X.md : updated`.
- [ ] Scout dispatches (if any) show their lines prefixed `scout ·` inside the
      exploring panel.
- [ ] Trigger an out-of-graph write ("add a note about this to
      &lt;other folder&gt;/X.md") → an approval card appears; deny with a reason →
      the model acknowledges the reason in its reply.
- [ ] Ask for a title with a colon ("create a note titled `Who: me?`") → no
      card; the model is corrected mechanically and retries with a sane title,
      keeping the exact wording as an alias.
- [ ] Break a graph on purpose (rename a note whose name another note's
      `parent:` points at), then open a **new** conversation on it → the
      interviewer knows about the unresolved parent without being told, and
      repairs it as ordinary work rather than announcing a check.
- [ ] Bind two tabs to the same graph → the ⚠ badge appears on **both**
      without clicking around. Same across two panels, if you drag one out.
- [ ] Restart Obsidian → every tab comes back, with the one you were on still
      selected; each transcript is restored and a new message resumes that
      tab's own session (the reply remembers that conversation, not another
      tab's). If the restart caught a reply mid-stream, the cut-off bubble
      renders as normal markdown, not a dimmed streaming one. Restored
      activity panels are settled — none stuck on "Thinking…" — and still
      expand to their lines.
- [ ] Restart with two tabs on the same graph, leaving one in the background →
      the badge still shows on the foreground tab (background tabs restore
      lazily; the badge must not need them loaded).
- [ ] Kill `claude.exe` in Task Manager mid-idle → the tab shows "The session
      ended…" and the next message reconnects instead of hanging. If an
      approval card was pending, it flips to **denied** — it must not stay
      clickable.
- [ ] Open a chat tab immediately after Obsidian starts → the picker says it
      is still indexing, then shows the projects by itself when done (no
      close/reopen needed).
- [ ] The picker's rows read as projects, not paths: the name leads, the folder
      it sits in is underneath only when the name alone would be ambiguous, and
      the note count is right-aligned. Squeeze the sidebar narrow → long names
      and folders ellipsise; the count never wraps or clips.
- [ ] The picker's question is set in the vault's **reading** font while the
      rows, counts and hint stay in the interface font — the one place the UI
      speaks in the interviewer's voice. Set the two fonts to different families
      in Appearance to see it.
- [ ] In a vault whose root is itself a project, the picker's hint offers to
      bootstrap a new folder for you. In a vault where it is not, the hint
      instead explains the folder-plus-charter shape — it must never point at a
      "whole vault" row that is not on the list.
- [ ] **Open** the model dropdown in a dark theme → the list itself is dark and
      its rows are readable, not a light popup with washed-out grey text. Switch
      Obsidian to a light theme and open it again → it follows. Same for the
      map's project selector. Then set the OS to the *opposite* of the vault's
      theme and check again: the list follows Obsidian, not the desktop.
- [ ] While a reply streams, the header shows a thinking indicator next to the
      model picker — and the header holds nothing else, since stopping lives in
      the composer now.
- [ ] **Queue.** With a turn running, type another message and press Enter →
      it does not reach the model. It appears above the composer behind a
      dashed rail, under "Waiting for this turn to finish", and stays out of
      the transcript. Queue a second → they stack in the order you typed them.
- [ ] When that turn finishes, the first queued message drops into the
      transcript **below** the turn's cost rule and starts its own turn; the
      second waits for that one. Each gets its own answer — never merged, never
      out of order.
- [ ] Hover a waiting message → an × appears; click it → the message stays on
      screen, loses its rail and reads *canceled*. Its words are still
      selectable, so you can copy them back out. The ones around it keep their
      order and still go out.
- [ ] Reach that × by keyboard (Tab out of the composer) → it becomes visible
      on focus and takes a focus ring.
- [ ] **Resend.** A canceled message carries a ↻, visible without hovering —
      it is the only live thing on a dead row and must not need to be hunted
      for. Click it with nothing running → the message goes out at once. Click
      it mid-turn → it rejoins the queue **in its old place**, so the list
      still reads top-to-bottom in the order things will be said and the one
      under it does not overtake it.
- [ ] Canceled messages stay put: sending something new does not sweep them
      off screen. Cancel two, resend one → the other is still there, still
      resendable. (Queue enough of them and the list scrolls rather than
      growing into the transcript.)
- [ ] **Stop.** While a turn runs, the composer's button reads "■ Stop" where
      Send was. Click it mid-tool-call → the turn stops and anything queued
      behind it flips to *canceled* rather than going out a beat later. Watch
      the console: no further tool calls land.
- [ ] Press **Escape** in the composer while a turn runs → same as clicking
      Stop. Press Escape with nothing running → nothing happens.
- [ ] Send a fresh message after a stop → it goes out in the same session (the
      reply still remembers what came before it), and the canceled ones are
      still sitting there to resend.
- [ ] Queue two messages, then kill `claude.exe` mid-turn → both flip to
      *canceled*, and the plugin does not restart the process by itself to
      spend a turn on them. Then hit ↻ on one → it reconnects and sends, the
      way a freshly typed message would.
- [ ] Queue in tab A, switch to tab B → B's composer is its own, with no queue,
      and A's is still there when you switch back. Close A mid-turn with
      messages queued → nothing in the console.
- [ ] Squeeze the sidebar narrow with a long queued message → it wraps inside
      its rail while the ×, *canceled* and ↻ stay right and never clip. On a
      message that wraps, they sit against its **first** line rather than
      floating halfway down it.
- [ ] Bind a fresh tab to a graph → the empty transcript explains what the
      interviewer does, sitting where the first message will land — at the
      same size and leading, so nothing shifts when the first reply arrives.
- [ ] The interviewer's replies are set full-width in the vault's reading font;
      your messages sit in a tinted bubble held off the right edge, in the UI
      font, with the bottom-right corner squared. In Appearance, set the text
      font and the interface font to different families → the two voices are
      visibly different. Set them the same → the bubble still tells them apart.
- [ ] Read that bubble **in the right sidebar**, which is where the panel
      normally lives and which Obsidian already paints in its secondary colour →
      the tint is still visible against it rather than melting into the
      background. Check it in a main-area tab too; it has to read in both.
- [ ] One size runs through the conversation: type a sentence, watch it queue,
      then watch it land in the transcript → it never changes size on the way.
      The composer matches the interviewer's replies too, so the two halves of
      the panel read as one column.
- [ ] The line between the transcript and the composer is the resize handle.
      Point at it → it thickens into the accent and the cursor becomes a
      vertical resize arrow. Drag it **up** → the message box grows and the
      transcript gives up the space and scrolls; drag it **down** → the box
      shrinks. It stops on its own before the box is too small to type in and
      before the send button is pushed off the bottom. Double-click the line →
      back to three lines. Try it in a narrow sidebar and a wide main-area tab.
- [ ] Tab to that line → it shows the same accent, and ↑/↓ resize by one line
      a press. There is no native corner grabber on the box any more; the line
      is the only handle, which is deliberate — two of them would fight.
- [ ] Resize the box, then let a turn run and stream a long reply → the box
      keeps the height you gave it. Switch tabs and come back → it is back to
      three lines, because the height is per-panel live state and is not
      persisted.
- [ ] **The bottom of the transcript holds still while you drag.** Scroll to the
      end, then grow the box → you are still at the end; the history must not
      slide up under the composer. Now scroll up so some particular line sits
      just above the composer, and grow the box → *that same line* is still the
      one just above it, and the history has scrolled up by exactly what the
      composer took. Shrink it back → you are where you started, with no drift
      after a long wobbling drag. Watch for a flicker: the transcript must
      never be painted in the old place and jump.
- [ ] **Presets.** Under the message box sits a row: a chevron, then **Ask me**
      and **Summarize**. There is no heading word — the two labels say what they
      are. They are quieter than Send — no fill, no border — until you point at
      one, and the row must not twitch as the border appears. Hover each → a
      tooltip says what it does. Tab to one → it takes the focus ring.
- [ ] The chevron sits on the message box's own left edge, not indented past it,
      so the row reads as part of the composer. Check at a narrow sidebar width
      too: the row must not wrap.
- [ ] The chevron points the way the row moves — right while collapsed, into the
      space the buttons will fill; left once they are out, to fold them back. It
      turns rather than swapping glyphs.
- [ ] Click **Ask me** with nothing running → a small **Ask me** badge appears in
      your side of the column, not the paragraph behind it, and a turn starts.
      The badge is a compact tinted pill: quieter and smaller than a message you
      typed, same squared corner, and set at the size of the button you pressed.
      What you get back is **one** question with a line on why that one — not a
      list, not a batch.
- [ ] The badge must not read as something you typed. Put a one-word typed reply
      ("Not yet.") next to one in the same conversation and check the two are
      told apart at a glance, in **both** themes — the tint is translucent, so
      check it against the sidebar's grey as well as a main tab's white.
- [ ] Do it on a project with several `- [ ]` boxes across different notes → the
      question it picks is one of those, and the reason it gives is about what
      the answer unblocks. Now do it on a project with no open boxes at all →
      it says so plainly and proposes somewhere to expand instead, rather than
      inventing a question to look busy.
- [ ] Click **Summarize** → a few paragraphs of prose. No headings, no tables,
      no roll-call of every note, and short enough to actually read. **Check the
      vault afterwards: nothing was written.** If the hub's `## Shape` has gone
      stale it says so in a line and offers to redraw it — and waits for you.
- [ ] Click a preset **while a turn is running** → it queues behind the turn
      exactly like a typed message, with the same × to take it back, and goes
      out when the turn lands. It waits as a badge too, not as the paragraph,
      and it must not change size crossing from the queue into the column.
- [ ] Collapse the row → the buttons go and the chevron stays. On its own it
      must still read as a control you can press rather than a stray mark:
      point at it and it takes a border and brightens. Restart Obsidian → still
      collapsed. Expand it, restart again → still open.
- [ ] With the row collapsed, reach the chevron by keyboard and check a screen
      reader calls it "Presets, collapsed" — the word survives as the
      accessible name even though nothing on screen says it.
- [ ] Open a second chat panel → its row has its own answer; collapsing one must
      not collapse the other. Switch between tabs inside one panel → the row is
      the panel's, so it does not change.
- [ ] Notices ("The session ended…") read as machinery — monospace behind a
      rail — not as the interviewer talking. An error notice's rail is red.
- [ ] Each turn ends on a hairline rule carrying its cost, not a floating
      grey pill.
- [ ] Drag the chat tab into the narrow right sidebar → the graph name stays
      readable, the model picker is never clipped, and the status text shortens
      before anything else does.
- [ ] **Links out.** Get the interviewer to name a note it filed to, so the
      reply carries a `[[wikilink]]`. Click it → the note opens in the main
      pane you last worked in, the same one the map opens notes into — not in
      a split over the chat, and not in the sidebar the chat is docked in.
      Ctrl-click → a new tab instead, ctrl-alt-click → a split. A link to a
      heading, `[[Note#Section]]`, lands on the heading.
- [ ] Ask it for a link to a note that does not exist (`[[Nonsense]]`) and
      click it → a notice says there is no such note. Check the vault
      afterwards: clicking must not have created `Nonsense.md`.
- [ ] Ask for a plain web link and click it → still opens in the browser.

## 2 — Dev vault: mindmap

- [ ] Open the mindmap; select a graph; the tree shape matches the folder
      structure (compare against the hub's Shape section).
- [ ] Collapse and expand nodes; restart Obsidian; collapse state survives.
- [ ] Alt-click any node opens the note; plain click on a leaf opens it too;
      plain click on a parent toggles collapse. Every open lands in the main
      pane you last worked in — not a split off the map, and never inside the
      sidebar. Open a note, click a second node → the same main pane switches
      to it rather than stacking another split. Links in the "not reachable"
      panel behave the same way.
- [ ] Close every main-area tab, then click a node → the note opens in a
      freshly made main pane instead of taking over the sidebar.
- [ ] Pan and zoom, then edit any note → the map updates after a beat without
      losing your pan/zoom. Switching graphs re-fits the whole new graph.
- [ ] Open a map on a graph big enough to overrun the pane → it opens showing
      the whole tree, not its top-left corner. Maximise the window on a small
      graph → the tree grows to use the pane instead of sitting marooned in
      the middle, and stops before the labels look like a mockup.
- [ ] The header reads: project selector, then a plain **"N notes"**, then the
      Heat switch. Nothing else — no "· N off the hub", and no amber warning on
      a flat graph. That number is the whole graph's note count; check it against
      the hub's Shape section.
- [ ] On a graph with many wikilinks, the dashed cross-links read as a faint
      mesh rather than a scribble over the tree; hover or focus a node and its
      own cross-links light up at both ends.
- [ ] The solid parent edges and the dashed cross-links are drawn at the **same
      weight** — they differ by dash and colour, not by thickness, so the tree
      does not shout over the links. Depth still shows: an edge leaving the hub
      is darker than one four levels down.
- [ ] Two notes that link **each other** get one dashed arc between them, not
      two stacked on the same pair. Same for a note that names the same target
      twice, or reaches it once by name and once by alias.
- [ ] Long note titles are ellipsised inside their box rather than overrunning
      it, and a collapsed node's `+N` sits after the name in a quieter face.
- [ ] Tab into the map → node outlines pick up the accent as focus moves.
      Enter opens the focused note; Space folds a branch. Hover or focus any
      node → the strip under the map reads its kind, status, how many children
      are folded away and any problems; move away → it returns to the hint.
- [ ] Break a `parent:` field by hand → within a second the note is counted in
      the orange "Not reachable from the hub · N" bar top-right; open the bar
      to see it listed; fix it → the map heals. Hand edits are legal. The bar
      starts closed and must stay closed until clicked — it covers the map
      when open.
- [ ] Rename a graph's folder in the file explorer while the mindmap shows it
      → the map falls back to the picker rather than silently drawing whichever
      project sorts first. Pick again and it draws.
- [ ] Open a note in another project and click the map ribbon icon (or use the
      note's ⋯ menu) → the map switches to that project and **fits** the new
      tree rather than keeping the pan you had on the old one.
- [ ] Click the map icon with no note open, on a map that has never been bound →
      the picker appears, asking "Which project should I draw?" with the same
      rows the chat's picker shows. Pick one → it draws, and the dropdown
      appears in the header from then on.
- [ ] With a bound map on screen, click the map icon while a note outside every
      project is open → the map keeps drawing what it was drawing. It must not
      throw away a working map because there was nothing to resolve.
- [ ] Run a chat session that files new statements → watch the map grow live.
- [ ] Open the mindmap right after Obsidian starts, close the tab before
      indexing finishes, reopen it → it works; nothing in the console suggests
      the closed tab kept redrawing.

### Heat

- [ ] The header carries a **Heat** switch, off when the map first opens. Off,
      every node's *colour* is what it always was — flat fill, grey rail. The
      areas are permanent and only their colours are conditional, so the one
      deliberate difference is that a folded node now carries the divider rule
      and sits a little wider to make room for it. Colour drift here is a bug;
      the rule is not.
- [ ] Turn Heat on → nodes take colour by how many `- [ ]` questions their own
      body holds: green at none, red at ten or more, ambers in between. Add a
      `- [ ] ` line to a note and save → within a second that node warms by one
      step, and nothing else on the map moves.
- [ ] Put a `- [ ]` inside a fenced code block → the node does **not** warm. Tick
      an existing box to `- [x]` → it cools. A `- [-]` cancelled line and a
      numbered `1. [ ]` line both count for nothing.
- [ ] Fold a branch → the node splits at a thin vertical rule: its own colour on
      the left with the title, the colour of everything it is hiding on the
      right with the `+N`. The two sides are read independently — a cool parent
      hiding hot children shows green beside red.
- [ ] Check that split against the numbers: fold a branch whose children hold,
      say, seven questions between them → the right-hand side is the seven-step
      colour, and the `+N` counts the same notes the colour is summing.
- [ ] Fold the **hub** → its spine splits the same way rather than staying one
      accent-coloured bar.
- [ ] A note with a validation problem keeps its red dashed border with Heat on,
      and shows its heat in the fill instead. A colour scale must not cost the
      map the "this note is broken" signal.
- [ ] Switch the vault between light and dark themes with Heat on → both ends of
      the scale stay legible and the labels stay readable on top of the fills.
- [ ] Toggle Heat, close the map tab, reopen it → the switch is where you left
      it. Restart Obsidian → still where you left it.
- [ ] With Heat on, hover and focus a node → the hover highlight still reads.
      Fold and unfold a few branches quickly → no flicker, no stray outline
      left behind at the divider.

## 3 — Vault copy: parity with the CLI skill

Work on a **copy** of the real vault. The reference is a Claude Code CLI
session with the original knowledge-graph skill on the same graph.

- [ ] Side-by-side grill: same graph, same opening ("what's next on X?") in the
      plugin and in the CLI skill. The plugin's interviewer should show the
      same discipline: one question at a time, no invented facts, files as it
      goes.
- [ ] Silent filing: statements land in notes with a one-line announcement
      (`— filed to Doors.md`), not a narrated essay.
- [ ] Steering words work: "park that", "not now", "back to the door question"
      redirect without losing the thread.
- [ ] Consult mid-grill: "what do we already know about the ferry?" flips into
      consult voice (reads, summarizes, cites notes) and back.
- [ ] Bootstrap: bind the vault root, ask to start a new graph "Ferry" → the
      interviewer asks for the folder name, then creates `Ferry/Ferry.md` with
      a charter and an empty Shape, and hangs new notes off it.
- [ ] Session preamble sanity: the interviewer knows today's date and the graph
      shape without reading files first (it was told at session start).
- [ ] Cost sanity: a short grill turn on Sonnet lands in the cents, visible in
      the per-turn cost line.

## 4 — Aftercheck

- [ ] Console shows no errors beyond the expected `[creative-buddy] claude:`
      debug lines.
- [ ] `workspace.json` has not grown absurdly — transcripts persist, but a tool
      item is one line plus two timestamps; no note bodies are stored.
- [ ] The vault copy diff (any diff tool) shows only notes you expected the
      sessions to touch.
