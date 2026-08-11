/** The graded-question register, ported line-for-line from oracle/obligations.py. */
import { normalizeContent, stripBom } from "./reader";
import { DateOnly, comparePyStrings, epochDays, isoDate, parseIsoDate } from "./py-compat";
import { VaultView } from "./types";
import { findGraphs, markdownFiles } from "./discovery";

const TASK = /^\s*[-*+]\s+\[(?<status>.)\]\s+(?<text>\S.*)$/;
const FENCE = /^(?<mark>`{3,}|~{3,})(?<info>.*)$/;

/** Yield [1-based line, task text] for every open task; fenced examples are stepped over. */
export function* openTasks(text: string): Generator<[number, string]> {
  let fence: string | null = null;
  // Python's splitlines() breaks on CRLF and lone CR too; normalize here so the
  // scanner honours the same boundaries whatever a caller feeds it. (Exotic
  // terminators like vertical-tab or the Unicode line separator are a known,
  // accepted divergence.)
  const lines = normalizeContent(text).split("\n");
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i]!;
    const marker = FENCE.exec(line.trim());
    if (marker !== null) {
      const mark = marker.groups!["mark"]!;
      const info = marker.groups!["info"]!;
      if (fence === null) {
        fence = mark;
      } else if (mark[0] === fence[0] && mark.length >= fence.length && info.trim() === "") {
        fence = null;
      }
      continue;
    }
    if (fence !== null) continue;
    const task = TASK.exec(line);
    if (task !== null && task.groups!["status"] === " ") {
      yield [i + 1, task.groups!["text"]!.replace(/\s+$/, "")];
    }
  }
}

const STAMP = /^(?<stamp>\d{4}-\d{1,2}-\d{1,2}):\s*(?<rest>.*)$/;
const GAP = /^GAP:\s*(?<rest>.*)$/i;
const LOOKUP = /^LOOK\s*UP:\s*(?<rest>.*)$/i;
const OWED = /^OWED:\s*(?<rest>.*)$/i;
const PARKED = /^PARKED(?:\s+\d{4}-\d{1,2}-\d{1,2})?:\s*(?<rest>.*)$/i;

const UPCOMING_DAYS = 14;

export const BUCKETS = [
  "overdue",
  "due_today",
  "upcoming",
  "later",
  "owed",
  "gaps",
  "lookups",
  "parked",
  "malformed",
] as const;
export type Bucket = (typeof BUCKETS)[number];

export interface Graded {
  bucket: Bucket;
  text: string;
  due: string | null;
}

function bucketFor(due: DateOnly, today: DateOnly): Bucket {
  const d = epochDays(due);
  const t = epochDays(today);
  if (d < t) return "overdue";
  if (d === t) return "due_today";
  if (d <= t + UPCOMING_DAYS) return "upcoming";
  return "later";
}

/** Graded verdict for a task, or null when it is compost. */
export function grade(task: string, today: DateOnly): Graded | null {
  const stamped = STAMP.exec(task);
  if (stamped !== null) {
    const due = parseIsoDate(stamped.groups!["stamp"]!);
    if (due === null) return { bucket: "malformed", text: task, due: null };
    const rest = stamped.groups!["rest"]!.trim();
    return { bucket: bucketFor(due, today), text: rest === "" ? task : rest, due: isoDate(due) };
  }
  const markers: Array<[RegExp, Bucket]> = [
    [OWED, "owed"],
    [GAP, "gaps"],
    [LOOKUP, "lookups"],
    [PARKED, "parked"],
  ];
  for (const [pattern, bucket] of markers) {
    const marked = pattern.exec(task);
    if (marked !== null) {
      const rest = marked.groups!["rest"]!.trim();
      return { bucket, text: rest === "" ? task : rest, due: null };
    }
  }
  return null;
}

export interface ObligationEntry {
  date?: string;
  note: string;
  line: number;
  text: string;
}

export type ObligationsReport = {
  today: string;
  counts: Record<Bucket, number>;
} & Record<Bucket, ObligationEntry[]>;

/** Every graded question under the root, filed by urgency. */
export function collectObligations(view: VaultView, today: DateOnly): Record<Bucket, ObligationEntry[]> {
  const graded = Object.fromEntries(
    BUCKETS.map((b): [Bucket, ObligationEntry[]] => [b, []]),
  ) as Record<Bucket, ObligationEntry[]>;
  for (const graphDir of findGraphs(view)) {
    for (const path of markdownFiles(view, graphDir)) {
      const text = stripBom(normalizeContent(view.get(path)!));
      for (const [line, task] of openTasks(text)) {
        const verdict = grade(task, today);
        if (verdict === null) continue;
        const entry: ObligationEntry = { note: path, line, text: verdict.text };
        if (verdict.due !== null) entry.date = verdict.due;
        graded[verdict.bucket].push(entry);
      }
    }
  }
  return graded;
}

/** Most pressing first, then by where the line lives. */
export function inReadingOrder(entries: ObligationEntry[]): ObligationEntry[] {
  return [...entries].sort((a, b) => {
    const da = a.date ?? "";
    const db = b.date ?? "";
    if (da !== db) return comparePyStrings(da, db);
    if (a.note !== b.note) return comparePyStrings(a.note, b.note);
    return a.line - b.line;
  });
}

export function buildObligationsReport(view: VaultView, today: DateOnly): ObligationsReport {
  const graded = collectObligations(view, today);
  const report = { today: isoDate(today) } as ObligationsReport;
  const counts = {} as Record<Bucket, number>;
  for (const bucket of BUCKETS) {
    report[bucket] = inReadingOrder(graded[bucket]);
    counts[bucket] = report[bucket].length;
  }
  report.counts = counts;
  return report;
}

/** The buckets the digest surfaces (later and parked are collected, never shown). */
export const SURFACED: ReadonlyArray<[Bucket, string]> = [
  ["overdue", "Overdue"],
  ["due_today", "Due today"],
  ["upcoming", `Within ${UPCOMING_DAYS} days`],
  ["owed", "Owed, undated"],
  ["gaps", "Gaps"],
  ["lookups", "To look up"],
  ["malformed", "Unreadable dates"],
];
