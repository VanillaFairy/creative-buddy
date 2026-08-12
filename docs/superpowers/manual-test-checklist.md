# Creative Buddy — manual test checklist

The unit suite proves the deterministic core; this pass proves the Obsidian
shells and the live interviewer. Run it top to bottom: dev vault first, then a
copy of the real vault, then the side-by-side parity items. Check items off as
they pass; note anything odd inline.

Setup: `npm run build`, copy `main.js` + `manifest.json` + `styles.css` into
`<vault>/.obsidian/plugins/creative-buddy/`, enable the plugin, open the console
(Ctrl-Shift-I) to catch stray errors.

## 1 — Dev vault: chat

- [ ] Open a chat tab from the ribbon; bind to a test graph; send a message on
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
      Stop.

## 2 — Dev vault: mindmap

- [ ] Open the mindmap; select a graph; the tree shape matches the folder
      structure (compare against the hub's Shape section).
- [ ] Collapse and expand nodes; restart Obsidian; collapse state survives.
- [ ] Alt-click any node opens the note in a split; plain click on a leaf opens
      it too; plain click on a parent toggles collapse.
- [ ] Pan and zoom, then edit any note → the map updates after a beat without
      losing your pan/zoom. Switching graphs re-centers.
- [ ] Break a `parent:` field by hand → within a second the node moves to the
      "not reachable" tray; fix it → the map heals. Hand edits are legal.
- [ ] Add `- [ ] owed: something` to a note → the orange dot appears on that
      node and the "Obligations (all graphs)" panel lists it (every graph, by
      design).
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
