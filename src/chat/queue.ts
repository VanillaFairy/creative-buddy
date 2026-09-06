/**
 * Messages you have committed to but the agent has not seen yet.
 *
 * A turn is a whole exchange with the model — its tools, its approvals, its
 * answer — and a conversation can only have one in flight. So a second thought
 * typed mid-turn waits its turn instead of being refused, and the panel shows
 * it waiting.
 *
 * Sending, a turn ending, and a dead session coming back are all the same move:
 * put the new message at the back if there is one, then hand the front to the
 * agent if nothing is running. One function covers all three, which is also
 * what keeps a late message from jumping the line.
 *
 * Nothing leaves this list on its own except the message that just went out.
 * A canceled one stays until you send it again, so the list always reads
 * top-to-bottom in the order things will be said.
 */

/**
 * A message on its way to the model: what it says, and what it is called.
 *
 * The two differ only for presets, where the text is a paragraph of standing
 * instructions and the name is the two words on the button that sent it. The
 * name travels with the message rather than being worked out from the text
 * afterwards — the prompts are prose files meant to be reworded, and rewording
 * one must not reach back into conversations that already happened.
 */
export interface Outgoing {
  /** What the model receives. */
  text: string;
  /** What the panel shows in its place. Absent on anything you typed yourself. */
  label?: string;
  /**
   * The note this was composed against — what it is *about*, when the user wrote
   * it while reading something. Absent when no note of this project was open.
   *
   * Captured when the message is written rather than when it goes out, so a
   * message queued behind a turn still means the note it meant, however far the
   * user has wandered by the time it is said.
   */
  note?: string;
}

/**
 * How long a message is yours after you commit to it.
 *
 * The moment one leaves, it is in the model's history for good — stopping the
 * turn aborts the answer and not the message, so there is no unsaying it
 * afterwards. This is the window in which there is still something to undo.
 */
export const HOLD_MS = 500;

/** An Outgoing that has not gone out yet. */
export interface Queued extends Outgoing {
  /** Taken back before it went out. Never sent, but kept to read, copy or send again. */
  canceled: boolean;
  /** Epoch ms you committed to it. Nothing leaves before `at + HOLD_MS`. */
  at: number;
}

export interface QueueStep {
  /** What is on screen above the composer, waiting and canceled alike. */
  queue: Queued[];
  /** The message to hand the agent now — null when nothing goes out yet. */
  send: Outgoing | null;
}

export function advance(queue: readonly Queued[], busy: boolean, now: number, message?: Outgoing): QueueStep {
  const blank = message === undefined || message.text.trim() === "";
  const waiting = blank ? [...queue] : [...queue, { ...message, canceled: false, at: now }];
  const next = waiting.findIndex((m) => !m.canceled);
  if (busy || next === -1) return { queue: waiting, send: null };
  const front = waiting[next]!;
  // The front holds the line even when something behind it is riper: what the
  // conversation is owed next is a matter of order, not of whose hold ran out.
  if (now < front.at + HOLD_MS) return { queue: waiting, send: null };
  // Everything the message carries, minus the fields that are the queue's own
  // bookkeeping. Naming the fields to keep instead is how `note` came to be
  // silently dropped once already, and the next field added would go the same way.
  const { canceled: _waiting, at: _committed, ...send } = front;
  return { queue: waiting.filter((_, i) => i !== next), send };
}

/**
 * Take one back, or put it back in line. Either way it keeps its place: what
 * you resend goes out where it was always going to, not at the end.
 */
export function setCanceled(queue: readonly Queued[], index: number, canceled: boolean): Queued[] {
  return queue.map((message, i) => (i === index ? { ...message, canceled } : message));
}

/**
 * Throw one away. Not the same as taking it back: a canceled message is still
 * on screen to read, copy or send again, and this one was never anywhere else.
 * It has no transcript row, is not in the saved workspace, and the model has
 * never seen it, so nothing survives it.
 */
export function remove(queue: readonly Queued[], index: number): Queued[] {
  return queue.filter((_, i) => i !== index);
}

/**
 * How long until the front of the queue may leave — null when nothing is due.
 *
 * The shell owns the clock and the timer; this says when to set it. A running
 * turn answers null because its ending is already the wake-up, and a queue of
 * nothing but canceled messages is waiting for a hand, not for time.
 */
export function msUntilSendable(queue: readonly Queued[], busy: boolean, now: number): number | null {
  if (busy) return null;
  const front = queue.find((m) => !m.canceled);
  if (front === undefined) return null;
  return Math.max(0, front.at + HOLD_MS - now);
}

/** Stopping takes back everything still waiting — none of it had been said yet. */
export function cancelAll(queue: readonly Queued[]): Queued[] {
  return queue.map((message) => (message.canceled ? message : { ...message, canceled: true }));
}

/** Whether anything is still due to go out, which is what makes a stop worth offering. */
export function hasWaiting(queue: readonly Queued[]): boolean {
  return queue.some((message) => !message.canceled);
}
