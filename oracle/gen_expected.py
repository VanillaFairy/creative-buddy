#!/usr/bin/env python3
"""Regenerate tests/expected/*.json by running the vendored oracle script
over every fixture vault. Run from anywhere; paths are script-relative.

Usage:  python oracle/gen_expected.py
"""
from __future__ import annotations

import json
import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
sys.path.insert(0, str(ROOT / "oracle"))

import graph_check  # noqa: E402

FIXTURES = ROOT / "tests" / "fixtures"
EXPECTED = ROOT / "tests" / "expected"


def relativize(report: dict, root: Path) -> dict:
    report["root"] = "."
    for graph in report["graphs"]:
        rel = Path(graph["path"]).relative_to(root)
        graph["path"] = "." if str(rel) == "." else rel.as_posix()
    return report


def main() -> int:
    EXPECTED.mkdir(parents=True, exist_ok=True)
    for fixture in sorted(FIXTURES.iterdir()):
        if not fixture.is_dir():
            continue
        root = fixture.resolve()
        gc = relativize(graph_check.build_report(root), root)
        (EXPECTED / f"{fixture.name}.graph-check.json").write_text(
            json.dumps(gc, ensure_ascii=False, indent=2) + "\n", encoding="utf-8", newline="\n")
        print(f"{fixture.name}: {gc['graphs'] and len(gc['graphs'])} graph(s)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
