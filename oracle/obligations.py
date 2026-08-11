#!/usr/bin/env python3
"""The graded-question register for knowledge-graph folders.

Open tasks in a graph are not all the same kind of thing. Most are compost —
questions the note is thinking out loud with, which nobody is waiting on. A few
are obligations, and those are what this script exists to surface:

  `- [ ] 2026-08-24: send the draft to Hana`   a dated obligation
  `- [ ] owed: send Farah the doc`             an errand with no date
  `- [ ] GAP: no scene stages Bo learning`     a hole someone must fill
  `- [ ] look up: when did the works close`    a question with an answer
  `- [ ] parked: the tatami night`             the user's own; never surfaced

`parked` is collected and never printed. It exists so that a thread the user
closed can be told apart from compost, which dies quietly, and from an `owed`,
which must not — the register's job there is to stay silent knowingly rather
than by accident.

The marker has to sit at the *start* of the task text. A date mentioned mid
sentence is prose, not a deadline, and treating it as one invents obligations
out of thin air. A date-shaped stamp that is not a real date lands in its own
`malformed` bucket rather than being dropped — a deadline the user cannot see
is the one failure this whole script exists to prevent.

This runs from a session-start hook over a real vault of several thousand
notes, so it never raises on a single bad file: undecodable bytes are replaced,
a byte-order mark is stripped, and a directory it cannot read is passed over.
The digest stays quiet unless something is due or owed.

Usage:  python obligations.py <root> [--today YYYY-MM-DD] [--json]
Exit:   0 always (a report is not a failure), 2 = usage error.
"""
from __future__ import annotations

import argparse
import json
import os
import re
import sys
from datetime import date, datetime, timedelta
from pathlib import Path

# The vault has Cyrillic note names and the Windows console does not default to
# UTF-8. Without this, printing a report can die with UnicodeEncodeError — and
# a hook that dies reports nothing at all.
sys.stdout.reconfigure(encoding="utf-8")
sys.stderr.reconfigure(encoding="utf-8")

SKIP_DIRS = {".obsidian", ".claude", ".git", ".trash", "node_modules"}
LOG_DIR_NAME = "log"
CHARTER = "## Charter"
UPCOMING_DAYS = 14

BUCKETS = ("overdue", "due_today", "upcoming", "later", "owed",
           "gaps", "lookups", "parked", "malformed")

# `- [ ] text`, `* [ ] text`, `+ [ ] text`, indented or not. Numbered lists are
# not Obsidian's task convention, so `1. [ ]` is deliberately not a task.
TASK = re.compile(r"^\s*[-*+]\s+\[(?P<status>.)\]\s+(?P<text>\S.*)$")

# The three markers, each anchored to the start of the task text.
STAMP = re.compile(r"^(?P<stamp>\d{4}-\d{1,2}-\d{1,2}):\s*(?P<rest>.*)$")
GAP = re.compile(r"^GAP:\s*(?P<rest>.*)$", re.IGNORECASE)
# `lookup:` written closed up is a plausible typo and nothing else legitimately
# starts a task that way, so it is accepted rather than silently lost.
LOOKUP = re.compile(r"^LOOK\s*UP:\s*(?P<rest>.*)$", re.IGNORECASE)
# An errand the user owns and refused to date. It never nags and never dies.
OWED = re.compile(r"^OWED:\s*(?P<rest>.*)$", re.IGNORECASE)
# A thread the user closed. Only they reopen it, so the register knows about it
# purely in order to say nothing. A date is accepted but not expected: notes
# carry no clock, and a hand-written one should not fall through to compost.
PARKED = re.compile(r"^PARKED(?:\s+\d{4}-\d{1,2}-\d{1,2})?:\s*(?P<rest>.*)$",
                    re.IGNORECASE)

FENCE = re.compile(r"^(?P<mark>`{3,}|~{3,})(?P<info>.*)$")


# --------------------------------------------------------------------------
# Reading notes
# --------------------------------------------------------------------------

def read_text(path: Path) -> str:
    """A note's text. A file we cannot read at all is treated as empty.

    `utf-8-sig` drops a byte-order mark if there is one, so a hub saved by a
    Windows editor still reads as a hub. `errors="replace"` means a note with
    undecodable bytes costs us a few characters, never the whole run.
    """
    try:
        return path.read_text(encoding="utf-8-sig", errors="replace")
    except OSError:
        return ""


def open_tasks(text: str):
    """Yield `(line number, task text)` for every open task in a note.

    Line numbers are 1-based, so the reader can jump straight to the line.

    Two things are stepped over. Task lines inside a fenced code block are
    examples, not obligations — the skill's own documentation shows the grammar
    that way, and a charter may well do the same. And only `[ ]` counts as
    open: Obsidian's other statuses (`[x]`, `[X]`, `[/]`, `[-]`, `[>]`) all
    mean the user has already dealt with the line, cancellations included.
    """
    fence: str | None = None
    for number, line in enumerate(text.splitlines(), 1):
        marker = FENCE.match(line.strip())
        if marker:
            mark = marker.group("mark")
            if fence is None:
                fence = mark
            elif mark[0] == fence[0] and len(mark) >= len(fence) and not marker.group("info").strip():
                fence = None
            continue
        if fence is not None:
            continue
        task = TASK.match(line)
        if task and task.group("status") == " ":
            yield number, task.group("text").rstrip()


# --------------------------------------------------------------------------
# Finding graphs and their notes
# --------------------------------------------------------------------------

def is_graph(directory: Path) -> bool:
    """True when the directory holds a hub note carrying a charter.

    The charter has to be a line of its own. A note that merely mentions
    `## Charter` in a sentence is talking about charters, not declaring one.
    """
    hub = directory / f"{directory.name}.md"
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

    A directory that is a graph is reported and not descended into, so a graph
    nested inside another is never found twice — its notes simply belong to the
    outer graph's scan. The root itself may be a graph.
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


def markdown_files(graph_dir: Path) -> list[Path]:
    """Every `.md` file in the graph, subfolders included.

    A `log` directory at any depth holds session logs rather than nodes, so it
    is left out however the user capitalised it.
    """
    files: list[Path] = []
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
                if entry.name not in SKIP_DIRS and entry.name.casefold() != LOG_DIR_NAME:
                    pending.append(path)
            elif path.suffix.lower() == ".md":
                files.append(path)
    return sorted(files, key=str)


# --------------------------------------------------------------------------
# Grading one task
# --------------------------------------------------------------------------

def bucket_for(due: date, today: date) -> str:
    """Which dated bucket a deadline falls in. Day 14 still counts as near."""
    if due < today:
        return "overdue"
    if due == today:
        return "due_today"
    if due <= today + timedelta(days=UPCOMING_DAYS):
        return "upcoming"
    return "later"


def grade(task: str, today: date) -> tuple[str, str, date | None] | None:
    """`(bucket, text, due date)` for a graded task, or None when it is compost.

    `text` is the task with its marker stripped — except for a malformed date,
    which keeps the whole original line so a human can see what to fix.
    """
    stamped = STAMP.match(task)
    if stamped:
        try:
            due = datetime.strptime(stamped.group("stamp"), "%Y-%m-%d").date()
        except ValueError:
            return "malformed", task, None
        return bucket_for(due, today), stamped.group("rest").strip() or task, due

    for pattern, bucket in ((OWED, "owed"), (GAP, "gaps"),
                            (LOOKUP, "lookups"), (PARKED, "parked")):
        marked = pattern.match(task)
        if marked:
            return bucket, marked.group("rest").strip() or task, None

    return None


# --------------------------------------------------------------------------
# The report
# --------------------------------------------------------------------------

def collect(root: Path, today: date) -> dict[str, list[dict]]:
    """Every graded question under the root, filed by urgency."""
    graded: dict[str, list[dict]] = {name: [] for name in BUCKETS}
    for graph_dir in find_graphs(root):
        for path in markdown_files(graph_dir):
            note = path.relative_to(root).as_posix()
            for number, task in open_tasks(read_text(path)):
                verdict = grade(task, today)
                if verdict is None:
                    continue
                bucket, text, due = verdict
                entry = {"note": note, "line": number, "text": text}
                if due is not None:
                    entry = {"date": due.isoformat(), **entry}
                graded[bucket].append(entry)
    return graded


def in_reading_order(entries: list[dict]) -> list[dict]:
    """Most pressing first, then by where the line lives.

    Dated entries sort chronologically; the undated buckets fall back to note
    and line, which is stable and matches how you would read the vault. Without
    this the register hands you the *least* overdue item first, which is the one
    thing it exists not to do.
    """
    return sorted(entries, key=lambda e: (e.get("date", ""), e["note"], e["line"]))


def build_report(root: Path, today: date) -> dict:
    graded = collect(root, today)
    ordered = {name: in_reading_order(graded[name]) for name in BUCKETS}
    return {
        "today": today.isoformat(),
        **ordered,
        "counts": {name: len(ordered[name]) for name in BUCKETS},
    }


# --------------------------------------------------------------------------
# Output
# --------------------------------------------------------------------------

# `later` and `parked` are collected but never printed: a December deadline read
# in August is not news at session start, and a parked thread is the user's own
# to reopen. The digest speaks up about what is due or owed.
SECTIONS = (
    ("overdue", "Overdue"),
    ("due_today", "Due today"),
    ("upcoming", f"Within {UPCOMING_DAYS} days"),
    ("owed", "Owed, undated"),
    ("gaps", "Gaps"),
    ("lookups", "To look up"),
    ("malformed", "Unreadable dates"),
)


def digest(report: dict) -> str:
    """The human-readable form: what is due or owed, named one line each.

    A run with nothing due prints nothing at all. This runs at every session
    start, so silence is how it says "you owe nobody anything today". Use
    --json when a caller wants the full picture, `later` included.
    """
    lines: list[str] = []
    for bucket, heading in SECTIONS:
        entries = report[bucket]
        if not entries:
            continue
        lines.append(f"{heading}:")
        for entry in entries:
            stamp = f"{entry['date']} — " if "date" in entry else ""
            lines.append(f"  {stamp}{entry['text']}  ({entry['note']}:{entry['line']})")
    return "\n".join(lines)


def main(argv: list[str] | None = None) -> int:
    parser = argparse.ArgumentParser(
        description="The graded-question register for knowledge-graph folders.",
    )
    parser.add_argument("root", type=Path, help="directory to scan for graphs")
    parser.add_argument("--today", metavar="YYYY-MM-DD",
                        help="grade against this date instead of the system date")
    parser.add_argument("--json", dest="as_json", action="store_true",
                        help="emit the full report as JSON")
    args = parser.parse_args(argv)

    if not args.root.is_dir():
        parser.error(f"not a directory: {args.root}")

    # `is not None`, not truthiness: `--today ""` is a mistake worth reporting,
    # not a quiet fallback to the system date.
    if args.today is not None:
        try:
            today = datetime.strptime(args.today, "%Y-%m-%d").date()
        except ValueError:
            parser.error(f"not a date in YYYY-MM-DD form: {args.today!r}")
    else:
        today = date.today()

    report = build_report(args.root.resolve(), today)

    if args.as_json:
        print(json.dumps(report, ensure_ascii=False, indent=2))
    else:
        text = digest(report)
        if text:
            print(text)

    return 0


if __name__ == "__main__":
    sys.exit(main())
