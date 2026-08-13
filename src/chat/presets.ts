/**
 * The composer's canned openings.
 *
 * A preset is a label and a block of text, and clicking one says that text as
 * though you had typed it — same queue, same transcript, same turn. Nothing
 * here computes anything about the graph: the interviewer has Grep and knows
 * the `- [ ]` convention (see `assets/prompts/system.md`), and handing it a
 * pre-baked inventory would be loading the whole graph by the back door.
 *
 * The texts live in `assets/prompts/presets/`, beside the rest of what this app
 * says to the model, so a wording change is a prose edit rather than a code one.
 */

import askMeMd from "../../assets/prompts/presets/ask-me.md";
import summarizeMd from "../../assets/prompts/presets/summarize.md";
import currentNoteQuestionsMd from "../../assets/prompts/presets/current-note-questions.md";

export interface DialogPreset {
  /** The React key for its button. Two rows under one key is a row that never updates. */
  id: string;
  label: string;
  /** The tooltip: what pressing it will actually do, in one line. */
  title: string;
  /** Sent verbatim. It lands in the transcript as your own words, because it is. */
  prompt: string;
}

export const DIALOG_PRESETS: readonly DialogPreset[] = [
  {
    id: "ask-me",
    label: "Ask me",
    title: "Pick the question this project most needs answered, and ask it",
    prompt: askMeMd,
  },
  {
    id: "summarize",
    label: "Summarize",
    title: "A short read on where the project stands — writes nothing",
    prompt: summarizeMd,
  },
];

/**
 * Whether the preset row is showing, out of a panel's saved state.
 *
 * Only a collapse you actually performed collapses it. A panel saved before the
 * row existed, a fresh panel with no state at all, a hand-edited workspace file
 * holding something that is not a boolean — all of them show the row, because a
 * feature hidden by a value nobody meant is a feature nobody finds again.
 */
export function restorePresetsOpen(state: unknown): boolean {
  return (state as { presetsOpen?: unknown } | null | undefined)?.presetsOpen !== false;
}

/**
 * The one preset that is not always there: it needs a note in front of you with
 * something still open on it.
 *
 * It is kept out of `DIALOG_PRESETS` rather than filtered out of it, because that
 * array is the row you can always count on — and everything downstream, from the
 * React keys to the panel's saved state, reads better when "always" means always.
 */
const NOTE_QUESTIONS: DialogPreset = {
  id: "note-questions",
  label: "Current note questions",
  title: "Work through this note's open questions, one at a time",
  prompt: currentNoteQuestionsMd,
};

/**
 * The row as it stands right now, given what the note in front of you still owes.
 *
 * The count decides whether a *button* exists and goes no further — it is never
 * sent, never quoted, never handed to the interviewer, which reads the note itself
 * and is therefore never working from a staler number than the file. That is the
 * promise at the top of this file kept rather than bent.
 */
export function visiblePresets(openQuestions: number): readonly DialogPreset[] {
  return openQuestions > 0 ? [...DIALOG_PRESETS, NOTE_QUESTIONS] : DIALOG_PRESETS;
}
