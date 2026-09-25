/**
 * Stands in for `node:events` everywhere in the bundle; esbuild.config.mjs routes
 * each `events` import here. Obsidian's renderer gives the Agent SDK the DOM's
 * AbortSignal, and Node's setMaxListeners rejects anything that is not a Node
 * emitter or a Node EventTarget. A DOM EventTarget has no listener cap to raise.
 */
import * as events from "node:events";

export const {
  EventEmitter,
  EventEmitterAsyncResource,
  once,
  on,
  errorMonitor,
  captureRejectionSymbol,
  getEventListeners,
  getMaxListeners,
  addAbortListener,
} = events;
export default events.EventEmitter;

type Target = EventTarget | NodeJS.EventEmitter;

export function setMaxListeners(n: number = events.defaultMaxListeners, ...targets: Target[]): void {
  if (targets.length === 0) return events.setMaxListeners(n);
  for (const target of targets) {
    try {
      events.setMaxListeners(n, target);
    } catch (error) {
      if (!isDomEventTarget(target)) throw error;
    }
  }
}

function isDomEventTarget(target: Target): boolean {
  return typeof (target as EventTarget).addEventListener === "function";
}
