/**
 * Line-oriented stream helpers shared by the server (parsing the director's
 * JSONL as it streams) and the browser (reading the NDJSON event stream).
 */

export interface LineSplitter {
  /** Adds a chunk and returns every line it completed (without the newline). */
  push(chunk: string): string[];
  /** Returns the trailing partial line, if any, and resets the buffer. */
  flush(): string[];
}

export function createLineSplitter(): LineSplitter {
  let buffer = "";
  return {
    push(chunk) {
      buffer += chunk;
      const parts = buffer.split("\n");
      buffer = parts.pop() ?? "";
      return parts.map((line) => line.replace(/\r$/, ""));
    },
    flush() {
      const rest = buffer.replace(/\r$/, "");
      buffer = "";
      return rest.trim() ? [rest] : [];
    },
  };
}

/** Serialises one event as a single NDJSON line. */
export function encodeNdjsonLine(value: unknown): string {
  return `${JSON.stringify(value)}\n`;
}

/**
 * Reads an NDJSON byte stream and yields each parsed object. Lines that are
 * not valid JSON are skipped.
 */
export async function* readNdjson(body: ReadableStream<Uint8Array>): AsyncGenerator<unknown> {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const splitter = createLineSplitter();
  try {
    while (true) {
      const { value, done } = await reader.read();
      const lines = done ? splitter.push(decoder.decode()).concat(splitter.flush()) : splitter.push(decoder.decode(value, { stream: true }));
      for (const line of lines) {
        if (!line.trim()) continue;
        try {
          yield JSON.parse(line);
        } catch {
          // A malformed line is dropped; the rest of the stream is still useful.
        }
      }
      if (done) return;
    }
  } finally {
    reader.releaseLock();
  }
}
