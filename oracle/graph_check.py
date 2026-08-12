#!/usr/bin/env python3
"""Structural checks for knowledge-graph folders.

A *graph* is a directory holding `<DirName>.md` (the hub) whose text contains a
line `## Charter`. Every other `.md` file inside is a node, except for anything
under a `Log/` directory — those are session logs, not nodes.

Five things get reported, and nothing else:

  unresolved-parent   a `parent:` value naming no note in the same graph
  orphan-root         a note other than the hub with no `parent:` at all
  cycle               a ring of notes that are each other's ancestors
  duplicate-name      two notes with the same name, so links are ambiguous
  misfiled            a note in a folder that is not one of its ancestors

The last two exist because the folder tree mirrors the parent tree. `parent:` is
the truth and the folders reflect it, so the reflection can drift; and once notes
live in separate folders, nothing stops two of them being given the same name,
which quietly breaks every link to either.

A folder that is not a graph is simply not a graph — there is nothing to
complain about, so it is passed over in silence.

This runs from a session-start hook over a real vault, so it never raises on a
single bad file: undecodable bytes are replaced, and frontmatter that will not
parse is read as no frontmatter at all.

Usage:  python graph_check.py <root> [--json]
Exit:   0 = no problems, 1 = problems found, 2 = usage error.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from dataclasses import dataclass
from pathlib import Path

import yaml

# The vault has Cyrillic note names and the Windows console does not default to
# UTF-8. Without this, printing a report can die with UnicodeEncodeError.
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

SKIP_DIRS = {".obsidian", ".claude", ".git", ".trash", "node_modules"}
LOG_DIR = "log"  # matched case-insensitively
CHARTER = "## Charter"


# --------------------------------------------------------------------------
# Reading notes
# --------------------------------------------------------------------------

def read_text(path: Path) -> str:
    """A note's text. A file we cannot read at all is treated as empty."""
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def frontmatter(text: str) -> dict:
    """The note's YAML frontmatter as a mapping.

    Returns `{}` when there is no frontmatter, when it does not close, when it
    is not valid YAML, or when it is not a mapping. Hand edits are legal here,
    so unreadable frontmatter is absorbed rather than raised — the note then
    simply has no keys, which usually makes it an orphan-root.
    """
    lines = text.splitlines()
    if not lines or lines[0].strip() != "---":
        return {}
    for index in range(1, len(lines)):
        if lines[index].strip() in ("---", "..."):
            block = "\n".join(lines[1:index])
            break
    else:
        return {}
    try:
        loaded = yaml.safe_load(block)
    except yaml.YAMLError:
        return {}
    return loaded if isinstance(loaded, dict) else {}


def innermost_scalar(value):
    """Dig the scalar out of a value YAML may have read as a nested list.

    `parent: [[Sample]]` — the unquoted wikilink form the conventions allow —
    is not a string to YAML. It is a list holding a list holding "Sample".
    """
    while isinstance(value, list):
        if not value:
            return None
        value = value[0]
    return value


def parent_name(raw) -> str | None:
    """Normalise a `parent:` value to a bare note name, or None if there isn't one.

    Strips quotes and `[[ ]]`, then drops a `|alias` or `#heading` tail. An
    empty value means the same as a missing key: this note has no parent.
    """
    value = innermost_scalar(raw)
    if value is None:
        return None
    text = str(value).strip()
    for quote in ('"', "'"):
        if len(text) >= 2 and text.startswith(quote) and text.endswith(quote):
            text = text[1:-1].strip()
    if text.startswith("[[") and text.endswith("]]"):
        text = text[2:-2]
    text = text.split("|", 1)[0].split("#", 1)[0].strip()
    return text or None


@dataclass(frozen=True)
class Note:
    """One node of a graph: where it lives and who it says its parent is."""
    path: Path
    parent: str | None

    @property
    def filename(self) -> str:
        return self.path.name

    @property
    def stem(self) -> str:
        return self.path.stem


def load_note(path: Path) -> Note:
    return Note(path=path, parent=parent_name(frontmatter(read_text(path)).get("parent")))


# --------------------------------------------------------------------------
# Finding graphs and their notes
# --------------------------------------------------------------------------

def hub_path(directory: Path) -> Path:
    return directory / f"{directory.name}.md"


def is_graph(directory: Path) -> bool:
    """True when the directory holds a hub note carrying a charter."""
    hub = hub_path(directory)
    if not hub.is_file():
        return False
    return any(line.strip() == CHARTER for line in read_text(hub).splitlines())


def child_directories(directory: Path) -> list[Path]:
    """Subdirectories worth walking into. Unreadable directories yield nothing."""
    try:
        return [Path(entry.path) for entry in os.scandir(directory)
                if entry.is_dir() and entry.name not in SKIP_DIRS]
    except OSError:
        return []


def find_graphs(root: Path) -> list[Path]:
    """Every graph at or under the root.

    A directory that is a graph is reported and not descended into, so nested
    graphs are never found — the inner folder's notes just belong to the outer
    graph. The root itself may be a graph.
    """
    found: list[Path] = []
    pending = [root]
    while pending:
        directory = pending.pop()
        if is_graph(directory):
            found.append(directory)
            continue
        pending.extend(child_directories(directory))
    return sorted(found)


def collect_notes(graph_dir: Path) -> list[Note]:
    """Every node in the graph, subfolders included. `Log/` is the one exclusion."""
    notes: list[Note] = []
    pending = [graph_dir]
    while pending:
        directory = pending.pop()
        try:
            entries = list(os.scandir(directory))
        except OSError:
            continue
        for entry in entries:
            path = Path(entry.path)
            if entry.is_dir():
                if entry.name.casefold() != LOG_DIR:
                    pending.append(path)
            elif path.suffix.lower() == ".md":
                notes.append(load_note(path))
    return sorted(notes, key=lambda note: str(note.path))


# --------------------------------------------------------------------------
# The three checks
# --------------------------------------------------------------------------

def same_path(left: Path, right: Path) -> bool:
    """Path equality that follows the filesystem's own case rules."""
    return os.path.normcase(str(left)) == os.path.normcase(str(right))


def resolve_parents(notes: list[Note], hub: Path) -> tuple[dict[Note, Note], list[dict]]:
    """Match each note's `parent:` to a note in the same graph.

    Returns the resolved child -> parent edges, plus the problems found along
    the way. Matching is by basename, case-insensitively. The hub is exempt
    from needing a parent, but if it declares one it is checked like any other.
    """
    by_name = {note.stem.casefold(): note for note in notes}
    edges: dict[Note, Note] = {}
    problems: list[dict] = []

    for note in notes:
        if note.parent is None:
            if not same_path(note.path, hub):
                problems.append({
                    "kind": "orphan-root",
                    "note": note.filename,
                    "detail": "no parent: value, and this note is not the hub",
                })
            continue
        target = by_name.get(note.parent.casefold())
        if target is None:
            problems.append({
                "kind": "unresolved-parent",
                "note": note.filename,
                "detail": f"parent {note.parent!r} names no note in this graph",
            })
        else:
            edges[note] = target

    return edges, problems


def find_cycles(notes: list[Note], edges: dict[Note, Note]) -> list[list[Note]]:
    """Every parent ring, each one found exactly once.

    Each note has at most one parent, so walking forward from an unvisited note
    either runs out or lands on a note already on the current walk — which is
    the ring. Notes settled by an earlier walk are never revisited, so a ring
    cannot be reported twice.
    """
    unseen, walking, settled = 0, 1, 2
    state = {note: unseen for note in notes}
    cycles: list[list[Note]] = []

    for note in notes:
        if state[note] != unseen:
            continue
        trail: list[Note] = []
        position: dict[Note, int] = {}
        current: Note | None = note
        while current is not None and state[current] == unseen:
            state[current] = walking
            position[current] = len(trail)
            trail.append(current)
            current = edges.get(current)
        if current is not None and state[current] == walking:
            cycles.append(trail[position[current]:])
        for walked in trail:
            state[walked] = settled

    return cycles


def cycle_problem(ring: list[Note]) -> dict:
    """One ring, named after its alphabetically first note so runs are stable."""
    head = min(ring, key=lambda note: os.path.normcase(note.filename))
    start = ring.index(head)
    ordered = ring[start:] + ring[:start]
    chain = " -> ".join(note.stem for note in [*ordered, head])
    return {
        "kind": "cycle",
        "note": head.filename,
        "detail": f"parent chain forms a cycle: {chain}",
    }


def duplicate_names(notes: list[Note]) -> list[dict]:
    """Notes sharing a name, which the graph cannot tell apart.

    Both `parent:` resolution here and Obsidian's own `[[wikilinks]]` match on
    the bare name, so two notes called the same thing in different folders are
    not two addresses — they are one address with two possible answers, and
    which one you get is an accident of walk order. Harmless while every note
    sits in one folder; a real hazard once the tree is mirrored into subfolders,
    which is exactly when the temptation to write a second `Overview` arrives.
    """
    seen: dict[str, list[Note]] = {}
    for note in notes:
        seen.setdefault(note.stem.casefold(), []).append(note)
    return [{
        "kind": "duplicate-name",
        "note": group[0].filename,
        "detail": "name is shared by " + ", ".join(
            str(other.path.parent.name) + "/" + other.filename for other in group[1:]),
    } for group in seen.values() if len(group) > 1]


def misfiled(notes: list[Note], graph_dir: Path, hub: Path) -> list[dict]:
    """Notes sitting in a folder that is not one of their ancestors.

    The folder tree mirrors the parent tree, but `parent:` is the truth and the
    mirror is allowed to be *shallower* than what it reflects — a path too long
    for the filesystem stops being nested and the note stays higher up. So the
    test is not "is this note in its parent's folder" but the weaker, honest
    one: is the folder it lives in an ancestor of it at all? That passes a
    deliberately shortened mirror and still catches a note filed under something
    it has nothing to do with.

    A note with children lives inside its own folder, so for those the folder
    one level up is the one that has to be an ancestor.
    """
    by_name = {note.stem.casefold(): note for note in notes}
    problems: list[dict] = []

    for note in notes:
        if same_path(note.path, hub):
            continue

        # LOCAL FIX (graph-buddy, 2026-08-11): the original guard
        # `len(ancestors) < len(notes)` never terminates when the ancestor
        # chain enters a parent ring — the set saturates below len(notes) and
        # the walk loops forever. Track visited notes instead. Non-ring
        # behavior is unchanged (a chain visits each note at most once).
        ancestors: set[str] = set()
        walked: set[str] = set()
        current = note
        while current.parent is not None and len(ancestors) < len(notes):
            key = os.path.normcase(str(current.path))
            if key in walked:
                break
            walked.add(key)
            parent = by_name.get(current.parent.casefold())
            if parent is None:
                break
            ancestors.add(parent.stem.casefold())
            if same_path(parent.path, hub):
                break
            current = parent

        folder = note.path.parent
        if folder.name.casefold() == note.stem.casefold():
            folder = folder.parent
        if same_path(folder, graph_dir):
            continue

        if folder.name.casefold() not in ancestors:
            problems.append({
                "kind": "misfiled",
                "note": note.filename,
                "detail": f"sits in {folder.name!r}, which is not one of its ancestors",
            })

    return problems


def check_graph(graph_dir: Path) -> dict:
    notes = collect_notes(graph_dir)
    hub = hub_path(graph_dir)
    edges, problems = resolve_parents(notes, hub)
    problems.extend(cycle_problem(ring) for ring in find_cycles(notes, edges))
    problems.extend(duplicate_names(notes))
    problems.extend(misfiled(notes, graph_dir, hub))
    return {
        "graph": graph_dir.name,
        "path": str(graph_dir),
        "counts": {"notes": len(notes), "problems": len(problems)},
        "problems": problems,
    }


def build_report(root: Path) -> dict:
    graphs = [check_graph(graph_dir) for graph_dir in find_graphs(root)]
    return {
        "ok": all(not graph["problems"] for graph in graphs),
        "root": str(root),
        "graphs": graphs,
    }


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------

def digest(report: dict) -> str:
    """The human-readable form: problems only.

    A sound run prints nothing at all. This runs at every session start, so
    silence is how it says "nothing wrong". Use --json when a caller wants the
    full picture, sound graphs included.
    """
    lines: list[str] = []
    for graph in report["graphs"]:
        if not graph["problems"]:
            continue
        lines.append(f"{graph['graph']} ({graph['path']}):")
        for problem in graph["problems"]:
            lines.append(f"  [{problem['kind']}] {problem['note']} — {problem['detail']}")
    return "\n".join(lines)


def tree(graph_dir: Path) -> str:
    """The graph drawn as a hierarchy, hub first.

    A flat graph is the commonest way one of these goes wrong, and the hardest
    thing to notice from inside a session: every individual filing decision
    looks reasonable while the hub quietly collects forty children. Nobody can
    fix a shape they cannot see, so this draws it.

    Notes that never reach the hub — orphans, and anything whose `parent:` did
    not resolve — are listed underneath rather than dropped, because those are
    exactly the ones a reader came looking for.
    """
    notes = collect_notes(graph_dir)
    hub = hub_path(graph_dir)
    edges, _ = resolve_parents(notes, hub)

    children: dict[str, list[Note]] = {}
    for child, parent in edges.items():
        children.setdefault(str(parent.path), []).append(child)
    for brood in children.values():
        brood.sort(key=lambda note: os.path.normcase(note.stem))

    lines: list[str] = []
    drawn: set[str] = set()

    def draw(note: Note, prefix: str, last: bool, root: bool) -> None:
        # A ring of notes cannot be reached from the hub — each note has one
        # parent, so a cycle has no way in — but drawing is not the place to
        # find that out, and `drawn` costs nothing.
        if str(note.path) in drawn:
            return
        drawn.add(str(note.path))
        if root:
            lines.append(note.stem)
            below = ""
        else:
            lines.append(f"{prefix}{'└── ' if last else '├── '}{note.stem}")
            below = prefix + ("    " if last else "│   ")
        brood = children.get(str(note.path), [])
        for index, child in enumerate(brood):
            draw(child, below, index == len(brood) - 1, False)

    by_path = {str(note.path): note for note in notes}
    root_note = by_path.get(str(hub))
    if root_note is not None:
        draw(root_note, "", True, True)

    stray = [note for note in notes if str(note.path) not in drawn]
    if stray:
        lines.append("")
        lines.append("(not reachable from the hub)")
        for note in sorted(stray, key=lambda n: os.path.normcase(n.stem)):
            lines.append(f"  {note.stem}"
                         + (f" — parent {note.parent!r}" if note.parent else " — no parent"))

    direct = len(children.get(str(hub), []))
    lines.append("")
    lines.append(f"{len(notes) - 1} nodes, {direct} of them hanging directly off the hub.")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="Structural checks for knowledge-graph folders.",
    )
    parser.add_argument("root", type=Path, help="directory to scan for graphs")
    parser.add_argument("--json", dest="as_json", action="store_true",
                        help="emit the full report as JSON")
    parser.add_argument("--tree", action="store_true",
                        help="draw each graph's hierarchy instead of checking it")
    args = parser.parse_args(argv)

    if not args.root.is_dir():
        parser.error(f"not a directory: {args.root}")

    if args.tree:
        # A viewer, not a check: it always succeeds, and it says nothing at all
        # when there is no graph here to draw.
        for graph_dir in find_graphs(args.root.resolve()):
            print(tree(graph_dir))
        return 0

    report = build_report(args.root.resolve())

    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        text = digest(report)
        if text:
            print(text)

    return 0 if report["ok"] else 1


if __name__ == "__main__":
    sys.exit(main())
