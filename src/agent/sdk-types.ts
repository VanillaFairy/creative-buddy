/** Structural subset of the Agent SDK surface the plugin touches. The real
 *  `query` from @anthropic-ai/claude-agent-sdk satisfies these shapes; keeping
 *  them local lets tests script the boundary without the SDK's 37-member unions. */

import { EffortLevel } from "./effort";

export interface SdkUserMessage {
  type: "user";
  message: { role: "user"; content: string };
  parent_tool_use_id: null;
  session_id?: string;
}

export type SdkMessage = Record<string, unknown> & { type: string; subtype?: string; session_id?: string };

export interface SdkQueryHandle extends AsyncIterable<SdkMessage> {
  interrupt(): Promise<unknown>;
  setModel(model?: string): Promise<void>;
  /** null clears the level, which is what a model without effort wants. */
  applyFlagSettings(settings: { effortLevel: EffortLevel | null }): Promise<void>;
  close(): void;
}

export type QueryFn = (params: { prompt: AsyncIterable<SdkUserMessage>; options: Record<string, unknown> }) => SdkQueryHandle;

/** Unbounded async queue feeding the streaming-input prompt. */
export class MessageChannel implements AsyncIterable<SdkUserMessage> {
  private queue: SdkUserMessage[] = [];
  private wake: (() => void) | null = null;
  private closed = false;

  async *[Symbol.asyncIterator](): AsyncGenerator<SdkUserMessage> {
    for (;;) {
      while (this.queue.length > 0) yield this.queue.shift()!;
      if (this.closed) return;
      await new Promise<void>((resolve) => (this.wake = resolve));
    }
  }

  enqueue(text: string): void {
    this.queue.push({ type: "user", message: { role: "user", content: text }, parent_tool_use_id: null });
    this.wake?.();
  }

  end(): void {
    this.closed = true;
    this.wake?.();
  }
}
