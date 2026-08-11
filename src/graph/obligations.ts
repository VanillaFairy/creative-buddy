/** The graded-question register, ported line-for-line from oracle/obligations.py. */

const TASK = /^\s*[-*+]\s+\[(?<status>.)\]\s+(?<text>\S.*)$/;
const FENCE = /^(?<mark>`{3,}|~{3,})(?<info>.*)$/;

/** Yield [1-based line, task text] for every open task; fenced examples are stepped over. */
export function* openTasks(text: string): Generator<[number, string]> {
  let fence: string | null = null;
  const lines = text.split("\n");
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
