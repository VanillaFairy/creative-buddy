# Creative Buddy

An Obsidian plugin that embeds a knowledge-graph interviewer — a conversational
companion that grows a mindmap of markdown notes under strict "never invent a
fact" discipline. It began life as a Claude Code CLI skill; this plugin moves it
into Obsidian: chat tabs for the interview, a living mindmap of the graph, and
all the mechanical work (discovery, validation) done by
deterministic TypeScript instead of the model. Inference rides your existing
Claude Code subscription through the Claude Agent SDK — no API metering, no
hosted service, nothing leaves your machine except the model calls Claude Code
itself makes.

## Requirements

- Obsidian desktop 1.13 or newer, with the vault on a local disk. Mobile is not
  supported (the plugin spawns Claude Code as a subprocess).
- [Claude Code](https://claude.com/claude-code) installed and logged in. The
  plugin finds `claude` on PATH or in the usual install locations; you can pin
  an explicit path in settings.
- Windows, macOS, or Linux. Filename rules are enforced to the strictest
  platform (Windows), so vaults stay portable.

## Install

Until this ships anywhere official, install by hand:

1. `npm ci && npm run build`
2. Copy `main.js`, `manifest.json`, and `styles.css` into
   `<your vault>/.obsidian/plugins/creative-buddy/`
3. Enable **Creative Buddy** in Obsidian's community-plugins settings.

## Using it

- **Chat** — the speech-bubble ribbon icon opens a conversation already bound to
  the project you are standing in, worked out from whichever note is open. If
  that note belongs to no project, a picker asks which one you meant. The
  interviewer grills you about your project, files what you say into notes, and
  announces each filing in one line. Sessions have no formal end — close the tab
  when you are done. Anything structurally wrong with the graph (an unresolved
  parent, a duplicate name, a misfiled note) is handed to the interviewer when a
  session starts, and it repairs those as part of ordinary work.
- **Mindmap** — the fork ribbon icon shows the graph as a tree: problem outlines
  and a tray for notes that fell off the hub. It updates live as notes change,
  whoever changes them — you, the interviewer, or a sync. The **Heat** switch in
  its header colours each node by how many questions it still owes an answer —
  green for none through red for ten or more — so you can see at a glance where
  the graph is worth an interview. A folded node splits in two: its own heat
  beside the heat of everything hidden under it.
- Right-clicking a note gives you both, on that note's project: *Open in Creative
  Buddy chat* and *Show in Creative Buddy map*. From the command palette,
  *Open chat panel* and *Open graph mindmap* behave like the icons, while
  *New conversation* always gets you a fresh unbound one.
- Each chat tab is one session on one graph — its own transcript, model, cost
  and session — and "+" on the tab strip adds another. The model picker seeds
  from settings; switching mid-conversation applies to the next turn. Type while
  a turn is running and your message queues rather than interleaving; it goes
  out when the turn lands, and you can cancel or resend it from the queue.

## Settings

| Setting | Meaning |
|---|---|
| Claude Code executable | Empty = auto-detect. The health check button verifies it runs. |
| Default model | Seeds new tabs: Opus 5 for depth, Sonnet 5 daily, Haiku 4.5 quick. |
| API key override | Leave empty to use your subscription. Only set this to deliberately switch to API billing — it is stored unencrypted in the vault's `.obsidian` folder. |

## Development

- `npm run dev` — esbuild watch mode.
- `npm test` — the full unit suite (the deterministic core is tested against
  machine-generated expectations from the original Python scripts).
- `npm run oracle` — regenerate those expectations (`tests/expected/`); the
  committed JSON must not drift.
- `npm run test:live` — one real subscription-auth session in a scratch vault.
  It spends a few cents; it is excluded from `npm test` on purpose.

## Safety

The interviewer works under a mechanical permission table, enforced in code
(not prompt-deep) at the SDK boundary:

| Action | Decision |
|---|---|
| Read / search inside the vault | allowed silently |
| Read / search in hidden folders (`.obsidian`, `.git`, …) | asks you first |
| Read / search outside the vault | asks you first |
| Write / edit inside the bound graph | allowed silently, after filename checks |
| Write / edit elsewhere in the vault, or outside it | asks you first |
| Anything else (shell, web, other tools) | not available at all |

Filename checks deny titles Windows cannot store (punctuation, control
characters, reserved device names, trailing dots) with a corrective message, so
the model retries with a sane title and keeps the exact wording as an alias.
The session's environment is scrubbed of every ambient variable that could
reroute auth, billing, or model choice, and the user's personal MCP connectors
are kept out of the session entirely.

**Two words of caution.** First: writes *inside the bound graph* are
auto-approved by design — that is what makes silent filing work — and an
Obsidian vault typically has no git history under it. If a session goes wrong,
there is no mechanical undo. Second: file access control is path-based; if you
mount external folders into your vault via symlinks or junctions, the boundary
follows the letters of the path, not the link target. Run your first sessions
against a **copy** of your vault until you trust the discipline, and consider
keeping the vault under version control regardless.
