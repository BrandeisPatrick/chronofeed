import { describe, expect, it } from "vitest";
import { createLineSplitter, encodeNdjsonLine, readNdjson } from "./ndjson";

describe("createLineSplitter", () => {
  it("returns only complete lines and keeps the rest buffered", () => {
    const s = createLineSplitter();
    expect(s.push('{"a":')).toEqual([]);
    expect(s.push('1}\n{"b"')).toEqual(['{"a":1}']);
    expect(s.push(":2}\n\n")).toEqual(['{"b":2}', ""]);
    expect(s.flush()).toEqual([]);
  });

  it("strips CR from CRLF line endings", () => {
    const s = createLineSplitter();
    expect(s.push("one\r\ntwo\r\n")).toEqual(["one", "two"]);
  });

  it("flushes a trailing partial line", () => {
    const s = createLineSplitter();
    s.push("done\nlast");
    expect(s.flush()).toEqual(["last"]);
    expect(s.flush()).toEqual([]);
  });
});

function streamOf(chunks: string[]): ReadableStream<Uint8Array> {
  const encoder = new TextEncoder();
  return new ReadableStream({
    start(controller) {
      for (const c of chunks) controller.enqueue(encoder.encode(c));
      controller.close();
    },
  });
}

describe("readNdjson", () => {
  it("parses objects split across chunks and skips malformed lines", async () => {
    const out: unknown[] = [];
    const body = streamOf([encodeNdjsonLine({ type: "era" }).slice(0, 5), encodeNdjsonLine({ type: "era" }).slice(5), "not json\n", '{"type":"done"}']);
    for await (const value of readNdjson(body)) out.push(value);
    expect(out).toEqual([{ type: "era" }, { type: "done" }]);
  });

  it("handles multi-byte characters split across chunks", async () => {
    const bytes = new TextEncoder().encode('{"t":"🏺"}\n');
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(bytes.slice(0, 8));
        controller.enqueue(bytes.slice(8));
        controller.close();
      },
    });
    const out: unknown[] = [];
    for await (const value of readNdjson(body)) out.push(value);
    expect(out).toEqual([{ t: "🏺" }]);
  });
});
