# Knowledge-Graph Buddy — Obsidian Plugin Design

**Date:** 2026-08-11
**Status:** Draft for review
**Working name:** graph-buddy (final name TBD)

## Context

The knowledge-graph skill (`.claude/skills/knowledge-graph/` in the General vault) has proven itself as a creative companion: a conversational interviewer that grows a mindmap of markdown notes under strict "never invent a fact" discipline. Today it runs only inside Claude Code — a CLI, a skill file, and two Python check scripts.

This project turns it into a fresh Obsidian plugin, built for the author's own daily use first. It embeds the interviewer as chat tabs inside Obsidian, renders the graph as a living mindmap, and moves all mechanical work out of the model into deterministic TypeScript. Inference rides the existing Claude Code subscription via the Claude Agent SDK — no API metering, no hosted service.

A broader exploration (paid skill package, hosted web app for non-technical creatives) preceded this design and is deliberately parked; its findings are summarized in the appendix. This plugin doubles as the prototype for any of those futures.

[Claudian](https://github.com/YishenTu/claudian) (MIT) proves the core mechanism — an Obsidian plugin embedding Claude Code via the Agent SDK on the user's subscription — and serves as the **reference implementation** for SDK wiring. The code here is written fresh, shaped around the graph concept.

## Goals

1. Full parity with the CLI skill experience: grill, consult, bootstrap modes; the iron rules; silent filing with one-line announcements; the approval discipline.
2. Multiple concurrent chat tabs, each bound to one graph and one model.
3. A per-tab **model picker** for the interviewer's brain (Opus 5 / Sonnet 5 / Haiku 4.5), with mechanical work never touching the expensive model.
4. A **mindmap view** from day one: live, navigable, honest about the graph's real shape.
5. Runs on the existing **Claude Code subscription** (Agent SDK + installed CLI login). API-key fallback exists but is not the path.
6. All structural checking and obligation tracking runs as **deterministic TypeScript** inside the plugin — continuous, free, instant.

**Success looks like:** the author stops using the CLI skill because the plugin is strictly better for daily graph work.

## Non-goals (v1)

- Intake mode, `/sweep`, `/compile`, `/test` (not built in the skill either).
- Mindmap editing (drag-to-reparent, rename-on-map). The map navigates and inspects; changes flow through conversation or normal note editing.
- Mobile. The Agent SDK spawns the CLI as a child process; the plugin declares `isDesktopOnly: true`.
- Community-store release polish, onboarding for strangers, monetization. Architecture should not preclude them; v1 does not build them.

## Constraints

- **The vault has no git.** Every write is irreversible. The plugin is developed against a dev vault and a copy of the real vault before touching the live one.
- **Google Drive rewrites mtimes.** Nothing may use timestamps to decide whether a note changed; indexing reads content (Obsidian's metadataCache already behaves this way).
- **Hand edits are legal.** The user edits notes outside the plugin constantly. GraphModel absorbs whatever it finds; it never "fixes" notes on its own.
- **Windows filenames.** Titles become filenames; `: / \ | ? * " < >` must be rejected before a write happens, not diagnosed after.

## Architecture

Four components, one direction of truth: files are the state, everything else is a view of them.

```
┌─────────────────────────────  Obsidian (desktop)  ─────────────────────────┐
│                                                                            │
│  ChatView (×N tabs) ──────► AgentService ──────► Claude Agent SDK ──► CLI  │
│        │                        │ permission hooks        (subscription)   │
│        │ approvals, streaming   │ tool calls: Read/Write/Edit/Glob/Grep    │
│        ▼                        ▼                                          │
│  ┌──────────────────────  vault files (.md)  ─────────────────────┐        │
│  └──────────────────────────────┬─────────────────────────────────┘        │
│                                 │ metadataCache + vault events             │
│                                 ▼                                          │
│                            GraphModel  (deterministic, no AI)              │
│                             │        │                                     │
│              validation ────┘        └──── index, obligations              │
│                                 │                                          │
│                                 ▼                                          │
│                            MindmapView (live tree + badges)                │
└────────────────────────────────────────────────────────────────────────────┘
```

### GraphModel — the deterministic core

A pure-TypeScript engine over the vault. No AI, no network. It is the port target for both Python scripts, whose behavior is the oracle for tests.

**Graph discovery.** A graph is a folder holding `<FolderName>.md` (the hub) whose text contains a line that is exactly `## Charter` (trimmed). Discovery walks the vault skipping `.obsidian`, `.claude`, `.git`, `.trash`, `node_modules`; a folder that is a graph is not descended into (nested graphs belong to the outer graph). `Log/` directories (case-insensitive) hold session logs, not nodes.

**Node index.** For every node: path, stem, `parent:` (normalized: unwrap YAML-nested lists, strip quotes and `[[ ]]`, drop `|alias` / `#heading` tails; empty ≡ absent), `aliases:`, `kind:`, `status:`, outgoing wikilinks, and open tasks with their grades. Built on Obsidian's metadataCache where possible; incremental updates from vault events (create/modify/delete/rename), debounced. Unparseable frontmatter reads as no frontmatter — hand edits are legal.

**Validation** (ported from `graph_check.py`, same five kinds and nothing else):

| Kind | Meaning |
|---|---|
| `unresolved-parent` | `parent:` names no note in this graph (matching by stem, case-insensitive) |
| `orphan-root` | a non-hub note with no `parent:` at all |
| `cycle` | a parent ring; each ring reported once, named by its alphabetically first note |
| `duplicate-name` | two notes share a stem (case-insensitive) — one address, two answers |
| `misfiled` | a note sitting in a folder that is not one of its ancestors (the mirror may be *shallower* than the tree, so the test is ancestor-membership, not exact placement; a note with children lives in its own folder, so the folder one level up is judged) |

Also computed: per-graph stats (node count, direct hub children) for the flat-hub warning the `--tree` view used to give.

**Obligations register** (ported from `obligations.py`). Open tasks (`- [ ]` / `* [ ]` / `+ [ ]`; only status `" "` counts; task lines inside fenced code blocks ignored) are graded by a marker anchored at the start of the task text:

- `YYYY-M-D:` → dated: `overdue` / `due_today` / `upcoming` (≤14 days) / `later`; a date-shaped stamp that isn't a real date lands in `malformed` (kept visible, never dropped)
- `owed:` → undated errand, never nags, never dies
- `GAP:` / `look up:` (also `lookup:`) → gaps and lookups
- `parked:` (optional date) → collected, **never surfaced**; everything unmarked is compost and ignored

Surfacing: `later` and `parked` are collected but not shown, matching the scripts' digest behavior.

### AgentService — the Agent SDK wrapper

One SDK session per chat tab. Claudian's `ClaudianService` is the reference for process management, streaming, and auth handling; the implementation is ours.

- **Working directory:** the vault root.
- **Auth:** the user's existing Claude Code CLI login (subscription billing). Settings expose a health check (CLI found? logged in?) and an optional API-key override field.
- **System prompt:** the plugin's embedded, adapted skill text (see "Prompt management"), plus a short per-session preamble naming the bound graph's hub path and today's date.
- **Model:** per tab — `claude-opus-5`, `claude-sonnet-5`, or `claude-haiku-4-5`; default configurable in settings. (Exact model IDs verified against the live Models API at implementation time.)
- **Tools:** Read, Write, Edit, Glob, Grep only. **No Bash** — the scripts it existed for are now GraphModel. No web tools in v1.
- **Subagent:** `kg-scout` carried over as an SDK subagent definition pinned to Haiku 4.5 — read-only (Read/Grep/Glob), one question in, a few sentences out.
- **Sessions:** SDK session ids retained per tab for resume after process death or Obsidian restart; transcript persisted per tab in plugin data.

**Permission policy** — the skill's approval table mapped onto SDK permission hooks:

| Tool call | Decision |
|---|---|
| Read/Glob/Grep anywhere in the vault | allow (reading was always legal; the prompt governs *when* it reads) |
| Write/Edit inside the bound graph's folder | allow, **after** filename-sanity check (reject `: / \ | ? * " < >` in new note titles with a corrective error the model sees) |
| Write/Edit outside the bound graph's folder | pause the stream, ask inline in the chat tab ("the skill's 'anything outside the graph folder — ask first' row") |
| Anything else (Bash, web, …) | deny — not in the tool list at all |

After any Write creating a new note, AgentService verifies the file exists and is non-empty; a zero-byte result is surfaced to the model as an error immediately (the skill's failed-write footgun, made mechanical).

### ChatView — tabs

An Obsidian `ItemView`; multiple leaves are multiple tabs. Per tab:

- **Binding:** one graph, chosen at tab creation from GraphModel's discovered graphs (or "new graph…" which triggers the bootstrap flow conversationally). Shown in the tab header.
- **Model picker** in the tab header; switching mid-conversation starts the next turn on the new model (history carries over; the SDK handles replay).
- **Streaming markdown** for responses; thinking indicated, not rendered.
- **Tool activity** as compact one-liners in the transcript ("created *References*, filed 3 statements into *Heavy Rain*"), collapsed by default, expandable to raw calls.
- **Inline approvals** when the permission hook pauses (out-of-graph writes): the request rendered with the target path and diff, allow/deny buttons, optional "why not" message back to the model on deny.
- **Wrap up** button: sends the session-end instruction (write `Log/YYYY-MM-DD-<letter>.md`, refresh the hub's `## Shape`), then shows GraphModel's current validation state for the graph.
- **Concurrency:** tabs run in parallel (separate SDK processes). Two tabs bound to the same graph both get a visible warning badge; no locking — last write wins, acceptable for a single-person tool.

### MindmapView — the living map

An Obsidian `ItemView` with a graph selector. One graph shown at a time.

- **Layout:** horizontal collapsible tree from the `parent:` hierarchy — hub at the root, d3 `flextree` layout (variable node sizes), SVG, d3-zoom pan/zoom. Collapse/expand per node; collapse state persisted per graph.
- **Cross-links:** wikilinks that are not parent edges drawn as faint curved overlay edges; toggleable.
- **Unreachable notes** (orphans, unresolved parents, rings) listed in a "not reachable from the hub" tray rather than dropped — exactly the notes a reader came looking for.
- **Node affordances:** click → open the note in a split pane; hover → title, kind, status, open-question count.
- **Badges:** red outline for nodes with validation problems; small dot for open obligations on the node; the hub shows the direct-children count with a warning tint when the graph is going flat.
- **Obligations panel:** a corner panel with the current register digest (overdue / due today / upcoming / owed / gaps / lookups / malformed) across all graphs — the plugin-world replacement for the SessionStart hook.
- **Live updates:** GraphModel events → debounced re-layout. Watching the map grow during a conversation is the point.

## Prompt management

The plugin **owns** the interviewer's instructions: an embedded prompt adapted from the current SKILL.md, stored as a plugin asset, exposed in settings as an editable text area with "reset to default". The vault's skill file retires once parity is reached.

Adaptation notes (what changes from SKILL.md):

- **Removed:** the "Session end, mechanically" section (Python script invocations — now GraphModel + the Wrap-up flow); Bash-dependent phrasing; Claude-Code-specific dispatch mechanics for kg-scout (becomes the SDK subagent, same contract).
- **Kept verbatim in spirit:** the iron rules; dispatch (grill / consult / bootstrap; intake still "not built — say so"); working-set discipline; node shape, statement, grading, conflict, and approval conventions; footguns that remain behavioral (no clock in the notes, oblique titles).
- **Changed:** approval rows that said "ask first" now reference the plugin's permission mechanism rather than conversational asking, where the mechanism enforces them; the session-log instruction is triggered by Wrap-up instead of "ending a session".

`references/grill.md` and `references/consult.md` ship as plugin assets too, loaded into the session the same way the skill loads them today (referenced from the main prompt, read on demand via the Read tool from a plugin-managed folder, or inlined — decided at implementation by measuring prompt size).

## One turn, end to end

1. User types into a tab bound to *Noir game*, model = Sonnet 5.
2. AgentService streams the turn; the model Reads the hub + working set, asks its next question, Writes a statement into `Heavy Rain.md`.
3. The Write passes the permission hook (inside graph folder, filename sane), lands on disk.
4. Obsidian fires a vault event → GraphModel re-indexes that file → MindmapView redraws the node, badge counts update.
5. If the model had tried to touch `Здоровье/…` (outside the graph), the stream would have paused with an inline approval card instead.

## Error handling

- **CLI missing / logged out:** settings health check with plain instructions; tabs refuse to start with a pointed message, never a stack trace.
- **SDK process dies:** the tab keeps its transcript, shows a resume button (SDK session id).
- **Rate limits / overload:** surfaced in the tab as a retry-later notice (subscription limits are the user's own).
- **Validation problems:** never block anything; they appear as map badges and in the wrap-up summary. The plugin does not auto-fix.
- **Malformed obligation dates:** shown in the obligations panel under "Unreadable dates" — a deadline the user cannot see is the one failure the register exists to prevent.

## Testing

- **GraphModel:** unit tests (vitest) against fixture vaults; the Python scripts run over the same fixtures generate the expected outputs (the oracle). Edge cases carried from the scripts: BOM-prefixed hubs, unparseable frontmatter, `parent: [[X]]` as nested YAML lists, fenced task examples, case-insensitive matching, shallow mirrors.
- **Permission hook:** unit-tested hard — inside/outside graph boundary, filename rejection, zero-byte detection. This is the safety boundary for a git-less vault.
- **AgentService:** integration tests with a mocked SDK stream; one live smoke test script against a scratch vault.
- **UI:** manual, in a dev vault; then against a *copy* of the real vault; only then the live vault.

## Tech stack

- TypeScript, esbuild, standard Obsidian plugin toolchain; `isDesktopOnly: true`.
- UI: React for ChatView/MindmapView internals (mounted inside ItemViews); d3 (`d3-hierarchy`/`flextree`, `d3-zoom`) for the map.
- `@anthropic-ai/claude-agent-sdk` for sessions; requires the Claude Code CLI installed and logged in.
- Exact dependency versions verified at implementation-planning time (latest stable), per standing convention.

## Milestones

1. **M1 — GraphModel + tests.** Discovery, index, validation, obligations; fixture suite green against the Python oracle.
2. **M2 — AgentService + single chat tab.** Embedded prompt, permission hooks, one working grill session end to end in a dev vault.
3. **M3 — Tabs + model picker + approvals + wrap-up.**
4. **M4 — MindmapView.** Tree, cross-links, badges, obligations panel, live updates.
5. **M5 — Parity pass.** Side-by-side with the CLI skill on real graphs (vault copy), prompt tuning, then retire the vault skill.

## Open questions

Answering one moves it down to Closed questions rather than striking it through
here. A decision reads better as a decision than as a crossed-out doubt, and
the answer is the part worth keeping — the question on its own only records
that we once did not know.

- Community release later — architecture keeps it possible; no v1 work.

## Closed questions

**Q.** What is the plugin finally called?

**A.** Creative Buddy (`creative-buddy` in `manifest.json`). The working name
graph-buddy lasted until 2026-08-12, and `docs/superpowers/` deliberately keeps
it in historical filenames and prose — including this file's own path — so the
build history stays searchable under the name it was written with.

**Q.** Do the grill and consult references inline into the system prompt, or
load on demand?

**A.** Inline, decided in M2 on the prompt-size measurement as planned.
`buildSystemPrompt` in `src/agent/prompts.ts` joins `system.md`, `grill.md` and
`consult.md` into one document, with a stitch note redirecting any `SKILL.md`
or `references/…` mention back into it rather than out to a file the session
cannot read. The prompt never grew enough for on-demand loading to earn its
complexity.

**Q.** Does the graph keep an obligations register — graded OWED / GAP / LOOK UP
/ PARKED questions, handed to the interviewer as a digest at session start and
shown as a panel on the map?

**A.** No. It was built (Tasks 11–13), shipped, and then removed whole in
`fde6f27` — the scanner, the grading, the digest, the map panel and its orange
dots, plus `oracle/obligations.py` and its fixtures. The removal was verified
rather than assumed: the oracle regenerates byte-identical for everything else,
so only the obligations expectations went. So wherever this spec or the
implementation plan mentions obligations, it is describing code that no longer
exists. What answers "where does this graph still owe me thinking?" today is the
map's Heat switch, which colours each node by the count of unanswered `- [ ]`
questions in its own body — the same population the register graded, read off
the notes directly instead of kept in a second structure beside them.

## Appendix — parked: making it available to others

Findings from the exploration that preceded this pivot, kept so they aren't re-derived later:

- **Shapes considered:** paid skill package for claude.ai/Claude Desktop subscribers (near-zero ops, weakest moat); hosted web app (best UX and revenue; you buy tokens wholesale and sell retail — user subscriptions cannot ride claude.ai plans); Obsidian plugin (this project); desktop app (Agent SDK makes it tractable).
- **Web-app economics (checked 2026-08):** Opus 5 turn ≈ $0.10–0.15 with good caching; Sonnet 5 ≈ $0.05–0.08. An all-Opus product at $10/mo is underwater for engaged users; viable shapes were two tiers by brain (~$12 Sonnet / ~$24 Opus) or a single ~$19–24 Opus tier with allowances.
- **Storage decision (web shape):** pluggable — hosted plus user's own Google Drive at launch; the plain-markdown format makes "your world is your folder" a differentiator and the GDPR story clean.
- **Market:** Sudowrite, NovelAI (generation-first; memory is a side feature), World Anvil, LegendKeeper (hand-built world bibles, no AI core), Novelcrafter (BYOK precedent). Nobody's core loop is a disciplined interviewer that never writes your story — that's the gap.
