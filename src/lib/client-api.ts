/** Browser-side helpers for calling the streaming routes. */

import { readNdjson } from "./ndjson";
import type { StreamEvent } from "./types";

const EVENT_TYPES = new Set(["era", "persona", "post", "typing", "skip", "error", "done"]);

function isStreamEvent(value: unknown): value is StreamEvent {
  return typeof value === "object" && value !== null && EVENT_TYPES.has((value as { type?: unknown }).type as string);
}

/**
 * POSTs `body` to a streaming route and calls `onEvent` for each event as it
 * arrives. HTTP failures are reported as an `error` event. Rejects with an
 * AbortError when `signal` aborts.
 */
export async function streamEvents(path: string, body: unknown, signal: AbortSignal, onEvent: (event: StreamEvent) => void): Promise<void> {
  let response: Response;
  try {
    response = await fetch(path, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal,
    });
  } catch (error) {
    if (signal.aborted) throw error;
    onEvent({ type: "error", code: "network", message: "Could not reach the Chronofeed server." });
    return;
  }
  if (!response.ok || !response.body) {
    let message = `Request failed (${response.status}).`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // Not JSON; keep the generic message.
    }
    onEvent({ type: "error", code: response.status === 429 ? "rate_limit" : "upstream", message });
    return;
  }
  let sawEnd = false;
  for await (const value of readNdjson(response.body)) {
    if (!isStreamEvent(value)) continue;
    if (value.type === "done" || value.type === "error") sawEnd = true;
    onEvent(value);
  }
  if (!sawEnd && !signal.aborted) {
    onEvent({ type: "error", code: "network", message: "The stream ended unexpectedly." });
  }
}

export function isAbortError(error: unknown): boolean {
  return error instanceof DOMException && error.name === "AbortError";
}

/** Random id that also works outside secure contexts (where crypto.randomUUID is missing). */
export function makeId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) return crypto.randomUUID();
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}
