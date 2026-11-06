import { describe, expect, it } from "vitest";
import { engagementFor } from "./engagement";
import { readModelConfig, shouldUseServerFallbacks, supportsServerFallbacks } from "./models";
import { castSizeFor, replyCountFor } from "./prompts";
import { feedRequestSchema, respondRequestSchema } from "./schemas";
import { cleanPostText, compactNumber, relativeTime, truncate } from "./text";

describe("cleanPostText", () => {
  it("strips wrapping quotes and a handle preamble", () => {
    expect(cleanPostText('"Hello there"')).toBe("Hello there");
    expect(cleanPostText("“Hello there”")).toBe("Hello there");
    expect(cleanPostText("@marta: Hello", "marta")).toBe("Hello");
  });

  it("keeps inner quotes and caps length", () => {
    expect(cleanPostText('"A" and "B"')).toBe('"A" and "B"');
    expect(Array.from(cleanPostText("word ".repeat(100))).length).toBeLessThanOrEqual(280);
  });

  it("truncates on a word boundary with an ellipsis", () => {
    expect(truncate("aaaa bbbb cccc", 11)).toBe("aaaa bbbb…");
    expect(truncate("short", 10)).toBe("short");
  });
});

describe("formatting", () => {
  it("compacts numbers", () => {
    expect(compactNumber(999)).toBe("999");
    expect(compactNumber(1200)).toBe("1.2K");
    expect(compactNumber(1000)).toBe("1K");
    expect(compactNumber(34_500)).toBe("35K");
    expect(compactNumber(1_500_000)).toBe("1.5M");
  });

  it("formats relative time", () => {
    const now = 10_000_000_000;
    expect(relativeTime(now - 20_000, now)).toBe("now");
    expect(relativeTime(now - 42 * 60_000, now)).toBe("42m");
    expect(relativeTime(now - 5 * 3_600_000, now)).toBe("5h");
    expect(relativeTime(now - 3 * 86_400_000, now)).toBe("3d");
  });
});

describe("engagementFor", () => {
  it("is deterministic and grows with clout", () => {
    expect(engagementFor("x", 3, false)).toEqual(engagementFor("x", 3, false));
    const avg = (clout: number) => {
      let sum = 0;
      for (let i = 0; i < 200; i++) sum += engagementFor(`p${i}`, clout, false).likes;
      return sum / 200;
    };
    expect(avg(5)).toBeGreaterThan(avg(3));
    expect(avg(3)).toBeGreaterThan(avg(1));
    expect(engagementFor("x", 5, true).likes).toBeLessThan(engagementFor("x", 5, false).likes);
  });
});

describe("model config", () => {
  it("defaults to Opus 5.5 at low effort with fallbacks on", () => {
    expect(readModelConfig({})).toEqual({ directorModel: "claude-opus-5-5", personaModel: "claude-opus-5-5", effort: "low", fallbacksEnabled: true });
  });

  it("reads overrides, and the persona model follows the director model", () => {
    expect(readModelConfig({ CHRONOFEED_MODEL: "claude-haiku-5-5", CHRONOFEED_EFFORT: "MEDIUM", CHRONOFEED_FALLBACKS: "off" })).toEqual({
      directorModel: "claude-haiku-5-5",
      personaModel: "claude-haiku-5-5",
      effort: "medium",
      fallbacksEnabled: false,
    });
    expect(readModelConfig({ CHRONOFEED_PERSONA_MODEL: "claude-haiku-5-5", CHRONOFEED_EFFORT: "bogus" })).toMatchObject({ personaModel: "claude-haiku-5-5", effort: "low" });
  });

  it("enables server-side fallbacks only for supported models", () => {
    for (const m of ["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5", "claude-opus-5-20260101"]) {
      expect(supportsServerFallbacks(m), m).toBe(true);
    }
    for (const m of ["claude-haiku-5-5", "claude-sonnet-5", "claude-opus-4-8", "claude-fable-5", "claude-opus-5-5-mini"]) {
      expect(supportsServerFallbacks(m), m).toBe(false);
    }
    const config = readModelConfig({});
    expect(shouldUseServerFallbacks("claude-opus-5-5", config)).toBe(true);
    expect(shouldUseServerFallbacks("claude-opus-5-5", { ...config, fallbacksEnabled: false })).toBe(false);
  });
});

describe("cast sizing", () => {
  it("uses about 6-10 personas, fewer for small feeds", () => {
    expect(castSizeFor(3)).toBe(4);
    expect(castSizeFor(8)).toBe(8);
    expect(castSizeFor(20)).toBe(10);
    for (let c = 3; c <= 20; c++) expect(replyCountFor(c)).toBeGreaterThanOrEqual(1);
  });
});

describe("request schemas", () => {
  it("defaults count and rejects year 0 and out-of-range values", () => {
    expect(feedRequestSchema.parse({ year: 1347 })).toEqual({ year: 1347, count: 8 });
    expect(feedRequestSchema.safeParse({ year: 0 }).success).toBe(false);
    expect(feedRequestSchema.safeParse({ year: 1347, count: 21 }).success).toBe(false);
    expect(feedRequestSchema.safeParse({ year: 3001 }).success).toBe(false);
  });

  it("caps the user's post length and the cast size", () => {
    const era = { year: 1347, label: "l", summary: "s", via: "via x", trends: [] };
    const p = { handle: "ann", name: "Ann", bio: "", location: "", avatar: "🙂", kind: "fictional", voice: "", clout: 3 };
    const userPost = { id: "u1", author: "you", text: "hi", minutesAgo: 0, replyToId: null, rootId: null };
    expect(respondRequestSchema.safeParse({ era, cast: [p], posts: [], userPost }).success).toBe(true);
    expect(respondRequestSchema.safeParse({ era, cast: [p], posts: [], userPost: { ...userPost, text: "x".repeat(281) } }).success).toBe(false);
    expect(respondRequestSchema.safeParse({ era, cast: Array(13).fill(p), posts: [], userPost }).success).toBe(false);
    expect(respondRequestSchema.safeParse({ era, cast: [p], posts: [], userPost: { ...userPost, author: "ann" } }).success).toBe(false);
  });
});
