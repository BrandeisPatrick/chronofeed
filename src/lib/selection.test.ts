import { describe, expect, it } from "vitest";
import { pickResponders, pickTickActions, seededRng, weightedSample } from "./selection";
import type { Persona, WirePost } from "./types";

const persona = (handle: string, clout: number): Persona => ({ handle, name: handle, bio: "", location: "", avatar: "🙂", kind: "fictional", voice: "", clout });
const cast = [persona("a", 1), persona("b", 2), persona("c", 3), persona("d", 4), persona("e", 5)];
const post = (id: string, author: string, replyToId: string | null = null): WirePost => ({ id, author, text: id, minutesAgo: 0, replyToId, rootId: replyToId });

describe("weightedSample", () => {
  it("returns distinct personas and never more than asked", () => {
    const rng = seededRng(1);
    for (let i = 0; i < 200; i++) {
      const picked = weightedSample(cast, 3, rng);
      expect(picked).toHaveLength(3);
      expect(new Set(picked.map((p) => p.handle)).size).toBe(3);
    }
    expect(weightedSample(cast.slice(0, 2), 5, rng)).toHaveLength(2);
  });

  it("favours high clout", () => {
    const rng = seededRng(7);
    const counts: Record<string, number> = {};
    for (let i = 0; i < 5000; i++) {
      const [p] = weightedSample(cast, 1, rng);
      counts[p.handle] = (counts[p.handle] ?? 0) + 1;
    }
    expect(counts.e).toBeGreaterThan(counts.a * 3);
  });
});

describe("pickResponders", () => {
  it("always includes the author of the replied-to post first, plus 0-2 others", () => {
    const rng = seededRng(42);
    const sizes = new Set<number>();
    for (let i = 0; i < 300; i++) {
      const r = pickResponders(cast, "b", rng);
      expect(r[0].handle).toBe("b");
      expect(r.length).toBeGreaterThanOrEqual(1);
      expect(r.length).toBeLessThanOrEqual(3);
      expect(new Set(r.map((p) => p.handle)).size).toBe(r.length);
      sizes.add(r.length);
    }
    expect(sizes).toEqual(new Set([1, 2, 3]));
  });

  it("picks 2-3 personas for the user's own top-level post", () => {
    const rng = seededRng(3);
    for (let i = 0; i < 100; i++) {
      const r = pickResponders(cast, null, rng);
      expect(r.length).toBeGreaterThanOrEqual(2);
      expect(r.length).toBeLessThanOrEqual(3);
    }
    expect(pickResponders(cast, "you", rng).length).toBeGreaterThanOrEqual(2);
  });

  it("is deterministic for a given seed", () => {
    expect(pickResponders(cast, "c", seededRng(9))).toEqual(pickResponders(cast, "c", seededRng(9)));
  });
});

describe("pickTickActions", () => {
  const posts = [post("p1", "a"), post("p2", "b"), post("p3", "you"), post("p4", "c", "p1")];

  it("returns 1-2 actions by distinct personas", () => {
    const rng = seededRng(5);
    for (let i = 0; i < 200; i++) {
      const actions = pickTickActions(cast, posts, rng);
      expect(actions.length).toBeGreaterThanOrEqual(1);
      expect(actions.length).toBeLessThanOrEqual(2);
      expect(new Set(actions.map((a) => a.persona.handle)).size).toBe(actions.length);
    }
  });

  it("mostly posts, sometimes replies to another persona (never to itself or the user)", () => {
    const rng = seededRng(11);
    let replies = 0;
    let total = 0;
    for (let i = 0; i < 500; i++) {
      for (const action of pickTickActions(cast, posts, rng)) {
        total++;
        if (action.kind === "reply") {
          replies++;
          expect(action.target.author).not.toBe(action.persona.handle);
          expect(action.target.author).not.toBe("you");
        }
      }
    }
    expect(replies / total).toBeGreaterThan(0.15);
    expect(replies / total).toBeLessThan(0.45);
  });

  it("only posts when there is nothing to reply to", () => {
    const actions = pickTickActions(cast, [], seededRng(2));
    expect(actions.every((a) => a.kind === "post")).toBe(true);
  });
});
