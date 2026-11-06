import { describe, expect, it } from "vitest";
import {
  buildThreads,
  contextPosts,
  emptyFeed,
  feedsReducer,
  pruneFeeds,
  replyCount,
  restoreFeeds,
  serializableFeeds,
  type ClientPost,
  type Feeds,
} from "./feed-state";
import type { WirePost } from "./types";

const NOW = 1_000_000_000_000;
const wire = (id: string, author: string, minutesAgo: number, replyToId: string | null = null, rootId: string | null = replyToId): WirePost => ({
  id,
  author,
  text: id,
  minutesAgo,
  replyToId,
  rootId,
});
const era = { year: 1347, label: "l", summary: "s", via: "via crier", trends: [] };

function loaded(): Feeds {
  let feeds: Feeds = feedsReducer({}, { type: "start", year: 1347, now: NOW });
  for (const event of [
    { type: "era", era } as const,
    { type: "post", post: wire("a", "ann", 30) } as const,
    { type: "post", post: wire("b", "bo", 10) } as const,
    { type: "post", post: wire("a1", "bo", 20, "a") } as const,
    { type: "done" } as const,
  ]) {
    feeds = feedsReducer(feeds, { type: "director", year: 1347, event, now: NOW });
  }
  return feeds;
}

describe("director events", () => {
  it("builds a ready feed with createdAt from minutesAgo", () => {
    const feed = loaded()[1347];
    expect(feed.status).toBe("ready");
    expect(feed.era).toEqual(era);
    expect(feed.posts.find((p) => p.id === "a")!.createdAt).toBe(NOW - 30 * 60_000);
  });

  it("discards partial posts on an error", () => {
    let feeds = feedsReducer({}, { type: "start", year: 1, now: NOW });
    feeds = feedsReducer(feeds, { type: "director", year: 1, event: { type: "post", post: wire("x", "ann", 1) }, now: NOW });
    feeds = feedsReducer(feeds, { type: "director", year: 1, event: { type: "error", code: "refusal", message: "no" }, now: NOW });
    expect(feeds[1]).toMatchObject({ status: "error", posts: [], error: { code: "refusal" } });
  });

  it("ignores events for years that are not in state", () => {
    const feeds = loaded();
    expect(feedsReducer(feeds, { type: "director", year: 99, event: { type: "done" }, now: NOW })).toBe(feeds);
  });
});

describe("threads", () => {
  it("orders roots newest first and replies oldest first", () => {
    const threads = buildThreads(loaded()[1347].posts);
    expect(threads.map((t) => t.root.id)).toEqual(["b", "a"]);
    expect(threads[1].replies.map((r) => r.id)).toEqual(["a1"]);
  });

  it("counts replies to roots and to replies", () => {
    const posts = loaded()[1347].posts;
    const get = (id: string) => posts.find((p) => p.id === id)!;
    expect(replyCount(posts, get("a"))).toBe(1);
    expect(replyCount(posts, get("a1"))).toBe(0);
  });
});

describe("live events", () => {
  it("queues new top-level tick posts and attaches replies directly", () => {
    let feeds = loaded();
    feeds = feedsReducer(feeds, { type: "live", year: 1347, event: { type: "typing", handle: "cy", replyToId: null }, now: NOW, queue: true });
    expect(feeds[1347].typing).toHaveLength(1);
    feeds = feedsReducer(feeds, { type: "live", year: 1347, event: { type: "post", post: wire("n", "cy", 0) }, now: NOW, queue: true });
    expect(feeds[1347].queued.map((p) => p.id)).toEqual(["n"]);
    expect(feeds[1347].typing).toHaveLength(0);
    feeds = feedsReducer(feeds, { type: "live", year: 1347, event: { type: "post", post: wire("r", "cy", 0, "b") }, now: NOW, queue: true });
    expect(feeds[1347].posts.some((p) => p.id === "r")).toBe(true);
    feeds = feedsReducer(feeds, { type: "show-queued", year: 1347 });
    expect(feeds[1347].queued).toEqual([]);
    expect(feeds[1347].posts.some((p) => p.id === "n")).toBe(true);
  });

  it("removes a typing placeholder on skip and keeps errors as a notice", () => {
    let feeds = loaded();
    feeds = feedsReducer(feeds, { type: "live", year: 1347, event: { type: "typing", handle: "ann", replyToId: "b" }, now: NOW, queue: false });
    feeds = feedsReducer(feeds, { type: "live", year: 1347, event: { type: "skip", handle: "ann", replyToId: "b" }, now: NOW, queue: false });
    expect(feeds[1347].typing).toEqual([]);
    feeds = feedsReducer(feeds, { type: "live", year: 1347, event: { type: "error", code: "rate_limit", message: "slow" }, now: NOW, queue: false });
    expect(feeds[1347]).toMatchObject({ status: "ready", notice: "slow" });
  });
});

describe("context and caching", () => {
  it("sends the focus thread plus recent posts, oldest first, with fresh minutesAgo", () => {
    const feed = loaded()[1347];
    const focus: ClientPost = { ...wire("u", "you", 0, "a"), createdAt: NOW };
    const posts = contextPosts({ ...feed, posts: [...feed.posts, focus] }, NOW + 5 * 60_000, focus);
    expect(posts.map((p) => p.id)).toEqual(["a", "a1", "b", "u"]);
    expect(posts[0].minutesAgo).toBe(35);
  });

  it("keeps the 12 most recently visited feeds", () => {
    const feeds: Feeds = {};
    for (let y = 1; y <= 15; y++) feeds[y] = { ...emptyFeed(y, y), status: "ready", era: { ...era, year: y } };
    const kept = pruneFeeds(feeds);
    expect(Object.keys(kept).map(Number).sort((a, b) => a - b)).toEqual([4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15]);
  });

  it("persists only ready feeds and restores them", () => {
    const feeds = { ...loaded(), 2000: emptyFeed(2000, NOW) };
    const saved = serializableFeeds(feeds);
    expect(saved.map((f) => f.year)).toEqual([1347]);
    expect(restoreFeeds(JSON.parse(JSON.stringify(saved)))).toHaveLength(1);
    expect(restoreFeeds("junk")).toEqual([]);
    expect(restoreFeeds([{ year: "x" }])).toEqual([]);
  });
});
