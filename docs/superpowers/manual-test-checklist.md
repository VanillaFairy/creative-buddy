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

- [ ] There is exactly **one** ribbon icon. It opens a chat panel in the right
      sidebar; clicking it again reveals that same panel rather than stacking
      another. Collapse the sidebar first, then click it → the sidebar reopens
      onto the panel rather than creating it out of sight.
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
      is a new conversation. "Open graph mindmap" reveals the one map.
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
- [ ] Wrap up → a `Log/` file appears, the hub's Shape section refreshes, and
      the structure-check notice lands in the transcript.
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
      is still indexing, then shows the graphs by itself when done (no
      close/reopen needed).
- [ ] While a reply streams, the header shows a thinking indicator next to
      Stop. The header's last slot holds exactly one button: Wrap up when
      idle, Stop while a turn runs — never a greyed-out Wrap up.
- [ ] Bind a fresh tab to a graph → the empty transcript explains what the
      interviewer does, sitting where the first message will land.
- [ ] The interviewer's replies are set full-width in the vault's reading
      font; your messages sit behind a left rail in the UI font. In Appearance,
      set the text font and the interface font to different families → the two
      voices are visibly different. Set them the same → the rail still tells
      them apart.
- [ ] Notices ("The session ended…", the structure check) read as machinery —
      monospace behind a rail — not as the interviewer talking. An error
      notice's rail is red.
- [ ] Each turn ends on a hairline rule carrying its cost, not a floating
      grey pill.
- [ ] Drag the chat tab into the narrow right sidebar → the graph name stays
      readable, the model picker and Stop are never clipped, and the status
      text shortens before anything else does.

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
- [ ] On a graph with many wikilinks, the dashed cross-links read as a faint
      mesh rather than a scribble over the tree; hover or focus a node and its
      own cross-links light up at both ends.
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
      → the selector falls back to another graph instead of a blank dropdown
      over an empty map.
- [ ] Run a chat session that files new statements → watch the map grow live.
- [ ] Open the mindmap right after Obsidian starts, close the tab before
      indexing finishes, reopen it → it works; nothing in the console suggests
      the closed tab kept redrawing.

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
