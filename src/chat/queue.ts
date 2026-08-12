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

export interface Queued {
  text: string;
  /** Taken back before it went out. Never sent, but kept to read, copy or send again. */
  canceled: boolean;
}

export interface QueueStep {
  /** What is on screen above the composer, waiting and canceled alike. */
  queue: Queued[];
  /** The message to hand the agent now — null when nothing goes out yet. */
  send: string | null;
}

export function advance(queue: readonly Queued[], busy: boolean, text = ""): QueueStep {
  const waiting = text.trim() === "" ? [...queue] : [...queue, { text, canceled: false }];
  const next = waiting.findIndex((message) => !message.canceled);
  if (busy || next === -1) return { queue: waiting, send: null };
  return { queue: waiting.filter((_, i) => i !== next), send: waiting[next]!.text };
}

/**
 * Take one back, or put it back in line. Either way it keeps its place: what
 * you resend goes out where it was always going to, not at the end.
 */
export function setCanceled(queue: readonly Queued[], index: number, canceled: boolean): Queued[] {
  return queue.map((message, i) => (i === index ? { ...message, canceled } : message));
}

/** Stopping takes back everything still waiting — none of it had been said yet. */
export function cancelAll(queue: readonly Queued[]): Queued[] {
  return queue.map((message) => (message.canceled ? message : { ...message, canceled: true }));
}

/** Whether anything is still due to go out, which is what makes a stop worth offering. */
export function hasWaiting(queue: readonly Queued[]): boolean {
  return queue.some((message) => !message.canceled);
}
