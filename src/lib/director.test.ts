import { describe, expect, it } from "vitest";
import { DirectorAssembler, parseDirectorLine } from "./director";
import { mockDirectorLines } from "./mock";
import { replyCountFor } from "./prompts";
import type { StreamEvent } from "./types";

const era = JSON.stringify({ type: "era", label: "Plague year", summary: "The pestilence arrives.", via: "town crier", trends: [{ tag: "#Plague", posts: "12000" }] });
const persona = (handle: string, clout = 3) =>
  JSON.stringify({ type: "persona", handle, name: handle.toUpperCase(), bio: "b", location: "Florence", avatar: "🕯️", kind: "fictional", voice: "v", clout });
const post = (ref: number, handle: string, extra: Record<string, unknown> = {}) =>
  JSON.stringify({ type: "post", ref, handle, text: `post ${ref}`, minutesAgo: 10 * ref, ...extra });

function run(lines: string[], count = 3): StreamEvent[] {
  const a = new DirectorAssembler({ year: 1347, count, idPrefix: "t" });
  return lines.flatMap((l) => a.accept(l));
}

describe("parseDirectorLine", () => {
  it("ignores blank lines, fences, prose and bad JSON", () => {
    for (const line of ["", "   ", "```json", "```", "Here is your feed:", '{"type":"post",', '{"type":"unknown"}']) {
      expect(parseDirectorLine(line)).toBeNull();
    }
  });

  it("normalises handles, clamps clout and prefixes via", () => {
    const p = parseDirectorLine(JSON.stringify({ type: "persona", handle: "@Brother Wen!", name: "W", bio: "b", location: "l", avatar: "🕯️", kind: "fictional", voice: "v", clout: 9 }));
    expect(p).toMatchObject({ handle: "brother_wen", clout: 5 });
    expect(parseDirectorLine(era)).toMatchObject({ type: "era", via: "via town crier", trends: [{ posts: 12000 }] });
  });

  it("tolerates a trailing comma and truncates long text", () => {
    const parsed = parseDirectorLine(`${JSON.stringify({ type: "post", ref: 1, handle: "a", text: "x".repeat(400), minutesAgo: 1 })},`);
    expect(parsed?.type === "post" && parsed.text.length).toBe(280);
  });

  it("rejects the reserved user handle", () => {
    expect(parseDirectorLine(persona("you"))).toBeNull();
  });
});

describe("DirectorAssembler", () => {
  it("emits era, personas and posts with assigned ids", () => {
    const events = run([era, persona("ann"), post(1, "ann"), persona("bo"), post(2, "bo")]);
    expect(events.map((e) => e.type)).toEqual(["era", "persona", "post", "persona", "post"]);
    expect(events[0]).toMatchObject({ era: { year: 1347, label: "Plague year" } });
    expect(events[2]).toMatchObject({ post: { id: "t-1", author: "ann", replyToId: null, rootId: null } });
  });

  it("resolves reply references into ids and thread roots", () => {
    const events = run([persona("ann"), post(1, "ann"), persona("bo"), post(2, "bo", { replyTo: 1 }), persona("cy"), post(3, "cy", { replyTo: 2 })]);
    const posts = events.flatMap((e) => (e.type === "post" ? [e.post] : []));
    expect(posts[1]).toMatchObject({ replyToId: "t-1", rootId: "t-1" });
    expect(posts[2]).toMatchObject({ replyToId: "t-2", rootId: "t-1" });
  });

  it("skips posts by unknown personas, unknown reply refs and duplicate refs", () => {
    const events = run([persona("ann"), post(1, "zed"), post(2, "ann", { replyTo: 99 }), post(3, "ann"), post(3, "ann")]);
    expect(events.filter((e) => e.type === "post")).toHaveLength(1);
  });

  it("caps top-level posts at the requested count but keeps replies", () => {
    const events = run([persona("ann"), persona("bo"), post(1, "ann"), post(2, "ann"), post(3, "ann"), post(4, "bo", { replyTo: 1 })], 2);
    const posts = events.flatMap((e) => (e.type === "post" ? [e.post] : []));
    expect(posts.map((p) => p.id)).toEqual(["t-1", "t-2", "t-4"]);
  });

  it("ignores a second era line and duplicate personas", () => {
    const events = run([era, era, persona("ann"), persona("ann")]);
    expect(events.map((e) => e.type)).toEqual(["era", "persona"]);
  });
});

describe("mock director", () => {
  it.each([3, 8, 20])("produces exactly %i top-level posts through the real pipeline", (count) => {
    const a = new DirectorAssembler({ year: -1250, count, idPrefix: "m" });
    const events = mockDirectorLines(-1250, count).flatMap((l) => a.accept(l));
    expect(events[0]).toMatchObject({ type: "era", era: { year: -1250 } });
    const posts = events.flatMap((e) => (e.type === "post" ? [e.post] : []));
    expect(posts.filter((p) => !p.replyToId)).toHaveLength(count);
    const replies = posts.filter((p) => p.replyToId);
    expect(replies.length).toBeGreaterThan(0);
    expect(replies.length).toBeLessThanOrEqual(replyCountFor(count));
    expect(JSON.stringify(events)).toContain("1250 BCE");
  });

  it("is deterministic", () => {
    expect(mockDirectorLines(1347, 8)).toEqual(mockDirectorLines(1347, 8));
  });
});
