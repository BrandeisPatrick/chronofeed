import "server-only";

import type { z } from "zod";
import { encodeNdjsonLine } from "@/lib/ndjson";
import type { StreamEvent } from "@/lib/types";

/** Request bodies larger than this are rejected before parsing. */
const MAX_BODY_BYTES = 64 * 1024;

export type ParsedBody<T> = { ok: true; data: T } | { ok: false; response: Response };

/** Reads, size-checks and validates a JSON request body. */
export async function parseBody<S extends z.ZodType>(request: Request, schema: S): Promise<ParsedBody<z.infer<S>>> {
  const fail = (status: number, error: string): ParsedBody<z.infer<S>> => ({ ok: false, response: Response.json({ error }, { status }) });
  const declared = Number(request.headers.get("content-length") ?? 0);
  if (declared > MAX_BODY_BYTES) return fail(413, "Request body too large.");
  let text: string;
  try {
    text = await request.text();
  } catch {
    return fail(400, "Could not read request body.");
  }
  if (new TextEncoder().encode(text).length > MAX_BODY_BYTES) return fail(413, "Request body too large.");
  let json: unknown;
  try {
    json = JSON.parse(text);
  } catch {
    return fail(400, "Request body must be JSON.");
  }
  const parsed = schema.safeParse(json);
  if (!parsed.success) return fail(400, "Invalid request body.");
  return { ok: true, data: parsed.data };
}

/**
 * Streams events as NDJSON. The generator receives a signal that aborts when
 * the browser disconnects or cancels, which in turn aborts the upstream
 * Claude request.
 */
export function ndjsonResponse(request: Request, run: (signal: AbortSignal) => AsyncGenerator<StreamEvent>): Response {
  const controller = new AbortController();
  const abort = () => controller.abort();
  request.signal.addEventListener("abort", abort, { once: true });

  const stream = new ReadableStream<Uint8Array>({
    async start(sink) {
      const encoder = new TextEncoder();
      try {
        for await (const event of run(controller.signal)) {
          if (controller.signal.aborted) break;
          sink.enqueue(encoder.encode(encodeNdjsonLine(event)));
        }
      } catch (error) {
        if (!controller.signal.aborted) {
          console.error("[chronofeed] stream failed", error);
          sink.enqueue(encoder.encode(encodeNdjsonLine({ type: "error", code: "upstream", message: "Something went wrong while generating." } satisfies StreamEvent)));
        }
      } finally {
        request.signal.removeEventListener("abort", abort);
        try {
          sink.close();
        } catch {
          // Already closed by a cancelled reader.
        }
      }
    },
    cancel() {
      controller.abort();
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "application/x-ndjson; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      "X-Accel-Buffering": "no",
    },
  });
}
