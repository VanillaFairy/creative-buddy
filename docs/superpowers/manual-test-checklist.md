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

- [ ] Both ribbon icons open their panel in the **right sidebar**. Collapse the
      sidebar first, then click a ribbon icon → the sidebar reopens onto the
      new panel rather than creating it out of sight. The chat icon makes a
      fresh panel each time; the map icon reveals the one map.
- [ ] Open a chat panel, then click the map icon → the chat panel is **still
      there**. Opening the map must never take over the sidebar leaf a chat is
      sitting in; that silently ends the session.
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
- [ ] Open a second tab on the same graph → the ⚠ shared badge appears on
      **both** tabs without clicking around.
- [ ] Restart Obsidian → the transcript is restored; a new message resumes the
      same session (the reply remembers the conversation). If the restart
      caught a reply mid-stream, the cut-off bubble renders as normal
      markdown, not a dimmed streaming one. Restored activity panels are
      settled — none is stuck on "Thinking…" — and still expand to their lines.
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
      node → the strip under the map reads its kind, status, what is owed and
      any problems; move away → it returns to the hint.
- [ ] Break a `parent:` field by hand → within a second the note is counted in
      the orange "Not reachable from the hub · N" bar top-right; open the bar
      to see it listed; fix it → the map heals. Hand edits are legal.
- [ ] Add `- [ ] owed: something` to a note → the orange dot appears on that
      node, and opening the "Obligations · all graphs" bar lists it (every
      graph, by design). Both bars start closed and must stay closed until
      clicked — they cover the map when open.
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
- [ ] Session preamble sanity: the interviewer knows today's date, the graph
      shape, and any due obligations without reading files first (it was told
      at session start).
- [ ] Cost sanity: a short grill turn on Sonnet lands in the cents, visible in
      the per-turn cost line.

## 4 — Aftercheck

- [ ] Console shows no errors beyond the expected `[creative-buddy] claude:`
      debug lines.
- [ ] `workspace.json` has not grown absurdly — transcripts persist, but a tool
      item is one line plus two timestamps; no note bodies are stored.
- [ ] The vault copy diff (any diff tool) shows only notes you expected the
      sessions to touch.
