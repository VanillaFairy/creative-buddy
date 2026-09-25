#!/usr/bin/env python3
"""The shape of a knowledge-graph folder.

A *graph* is a directory holding `<DirName>.md` (the hub) whose text contains a
line `## Charter`. Every other `.md` file inside is a node, except for anything
under a `Log/` directory — those are session logs — and anything under a folder
that holds tooling rather than notes (any dot-folder, and `node_modules/`).

**The folder tree is the hierarchy.** A folder speaks through a note carrying
its own name, sitting either inside it (`World/World.md`) or beside it
(`Buddies.md` next to `Buddies/`); everything in that folder hangs off that
note, and the note itself answers to the folder above. A folder nobody speaks
for is a filing convenience rather than a generation, so its notes pass up to
the nearest folder that does speak.

This script used to check five things — unresolved parents, orphans, cycles,
duplicate names and misfiled notes — all of which existed because a note's
parent came from a `parent:` field resolved by bare name, which the folders
then had to agree with. A path is unique and a directory tree has no rings, so
none of those five can be expressed any more: nothing to check, only a shape to
draw. What is left is the oracle for `src/graph/hierarchy.ts`.

Usage:  python graph_check.py <root> [--json]
Exit:   0 always, bar a usage error (2). There is nothing here that can fail.
"""
from __future__ import annotations

import argparse
import json
import os
import sys
from pathlib import Path

# The vault has Cyrillic note names and the Windows console does not default to
# UTF-8. Without this, printing a tree can die with UnicodeEncodeError.
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

SKIP_DIRS = {"node_modules"}
LOG_DIR = "log"  # matched case-insensitively
CHARTER = "## Charter"


def read_text(path: Path) -> str:
    """A note's text. A file we cannot read at all is treated as empty."""
    try:
        return path.read_text(encoding="utf-8", errors="replace")
    except OSError:
        return ""


def same_path(left: Path, right: Path) -> bool:
    """Path equality that follows the filesystem's own case rules."""
    return os.path.normcase(str(left)) == os.path.normcase(str(right))


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


def is_tooling(name: str) -> bool:
    """Dot-folders (`.obsidian`, `.git`, ...) and `node_modules` hold tooling, not notes."""
    return name.startswith(".") or name in SKIP_DIRS


def child_directories(directory: Path) -> list[Path]:
    """Subdirectories worth walking into. Unreadable directories yield nothing."""
    try:
        return [Path(entry.path) for entry in os.scandir(directory)
                if entry.is_dir() and not is_tooling(entry.name)]
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


def collect_notes(graph_dir: Path) -> list[Path]:
    """Every node in the graph, subfolders included.

    `Log/` is excluded because session logs are not nodes, and tooling folders
    because `.claude/` and its like hold somebody's tooling rather than
    somebody's notes.
    """
    notes: list[Path] = []
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
                if entry.name.casefold() != LOG_DIR and not is_tooling(entry.name):
                    pending.append(path)
            elif path.suffix.lower() == ".md":
                notes.append(path)
    return sorted(notes, key=str)


# --------------------------------------------------------------------------
# The hierarchy
# --------------------------------------------------------------------------

def hierarchy(note_paths: list[Path], graph_dir: Path, hub: Path) -> dict[str, str]:
    """Child note path -> parent note path. The hub is absent; it is the root."""
    by_norm = {os.path.normcase(str(p)): str(p) for p in note_paths}

    def speaker(directory: Path) -> str | None:
        if same_path(directory, graph_dir):
            return str(hub)
        name = directory.name
        if not name:
            return None
        inside = by_norm.get(os.path.normcase(str(directory / f"{name}.md")))
        if inside is not None:
            return inside
        return by_norm.get(os.path.normcase(str(directory.parent / f"{name}.md")))

    parent_of: dict[str, str] = {}
    for path in note_paths:
        if same_path(path, hub):
            continue
        directory = path.parent
        found: str | None = None
        # Bounded by the path's own depth: every step drops a segment.
        for _ in range(len(path.parts) + 1):
            here = speaker(directory)
            # Skipping itself is what sends a note that speaks for its own
            # folder up to the folder above, rather than making it its own parent.
            if here is not None and os.path.normcase(here) != os.path.normcase(str(path)):
                found = here
                break
            if same_path(directory, graph_dir):
                break
            up = directory.parent
            if up == directory:
                break
            directory = up
        parent_of[str(path)] = found if found is not None else str(hub)
    return parent_of


def broods(parent_of: dict[str, str]) -> dict[str, list[str]]:
    """Parent -> children, in the order a reader meets them."""
    out: dict[str, list[str]] = {}
    for child, parent in parent_of.items():
        out.setdefault(parent, []).append(child)
    for brood in out.values():
        brood.sort(key=lambda p: Path(p).stem.casefold())
    return out


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------

def tree_lines(graph_dir: Path) -> list[str]:
    """The graph drawn as a hierarchy, hub first.

    A flat graph is the commonest way one of these goes wrong, and the hardest
    thing to notice from inside a session: every individual filing decision
    looks reasonable while the hub quietly collects forty children. Nobody can
    fix a shape they cannot see, so this draws it.
    """
    notes = collect_notes(graph_dir)
    hub = hub_path(graph_dir)
    children = broods(hierarchy(notes, graph_dir, hub))

    lines: list[str] = []

    def draw(path: str, prefix: str, last: bool, root: bool) -> None:
        stem = Path(path).stem
        if root:
            lines.append(stem)
            below = ""
        else:
            lines.append(f"{prefix}{'└── ' if last else '├── '}{stem}")
            below = prefix + ("    " if last else "│   ")
        brood = children.get(path, [])
        for index, child in enumerate(brood):
            draw(child, below, index == len(brood) - 1, False)

    if any(same_path(note, hub) for note in notes):
        draw(str(hub), "", True, True)
    return lines


def describe_graph(graph_dir: Path) -> dict:
    notes = collect_notes(graph_dir)
    hub = hub_path(graph_dir)
    children = broods(hierarchy(notes, graph_dir, hub))
    return {
        "graph": graph_dir.name,
        "path": str(graph_dir),
        "counts": {"notes": len(notes) - 1, "hubChildren": len(children.get(str(hub), []))},
        "tree": tree_lines(graph_dir),
    }


def build_report(root: Path) -> dict:
    return {
        "root": str(root),
        "graphs": [describe_graph(graph_dir) for graph_dir in find_graphs(root)],
    }


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(description="The shape of a knowledge-graph folder.")
    parser.add_argument("root", type=Path, help="directory to scan for graphs")
    parser.add_argument("--json", dest="as_json", action="store_true",
                        help="emit the full report as JSON")
    args = parser.parse_args(argv)

    if not args.root.is_dir():
        parser.error(f"not a directory: {args.root}")

    report = build_report(args.root.resolve())
    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        for graph in report["graphs"]:
            print("\n".join(graph["tree"]))
            print()
            print(f"{graph['counts']['notes']} nodes, "
                  f"{graph['counts']['hubChildren']} of them hanging directly off the hub.")
    return 0


if __name__ == "__main__":
    sys.exit(main())
