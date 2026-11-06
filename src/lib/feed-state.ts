/**
 * Client-side feed state: one {@link Feed} per visited year, updated by pure
 * reducer functions from the server's stream events.
 */

import type { EraBrief, ErrorCode, Persona, StreamEvent, WirePost } from "./types";
import { MAX_CONTEXT_POSTS } from "./schemas";

export interface ClientPost extends WirePost {
  /** Epoch ms; relative times are rendered from this. */
  createdAt: number;
}

export interface Typing {
  handle: string;
  replyToId: string | null;
}

export interface Feed {
  year: number;
  status: "loading" | "ready" | "error";
  era: EraBrief | null;
  cast: Persona[];
  /** Visible posts, top-level and replies, in arrival order. */
  posts: ClientPost[];
  /** New top-level posts from background activity, behind the "Show N new posts" pill. */
  queued: ClientPost[];
  typing: Typing[];
  error: { code: ErrorCode; message: string } | null;
  /** A non-fatal problem from a reply or tick, shown above the feed. */
  notice: string | null;
  /** Last time this year was visited, for cache eviction. */
  visitedAt: number;
}

export const MAX_CACHED_FEEDS = 12;

export function emptyFeed(year: number, now: number): Feed {
  return { year, status: "loading", era: null, cast: [], posts: [], queued: [], typing: [], error: null, notice: null, visitedAt: now };
}

function toClient(post: WirePost, now: number): ClientPost {
  return { ...post, createdAt: now - post.minutesAgo * 60_000 };
}

function withoutTyping(typing: Typing[], handle: string, replyToId: string | null): Typing[] {
  const index = typing.findIndex((t) => t.handle === handle && t.replyToId === replyToId);
  return index === -1 ? typing : typing.filter((_, i) => i !== index);
}

/** Applies an event from the director stream (/api/feed). */
export function applyDirectorEvent(feed: Feed, event: StreamEvent, now: number): Feed {
  switch (event.type) {
    case "era":
      return { ...feed, era: event.era };
    case "persona":
      return feed.cast.some((p) => p.handle === event.persona.handle) ? feed : { ...feed, cast: [...feed.cast, event.persona] };
    case "post":
      return { ...feed, posts: [...feed.posts, toClient(event.post, now)] };
    case "error":
      // An incomplete opening feed is discarded (a refusal's partial output must not be shown as complete).
      return { ...feed, status: "error", posts: [], error: { code: event.code, message: event.message } };
    case "done":
      return { ...feed, status: "ready" };
    default:
      return feed;
  }
}

/**
 * Applies an event from a persona stream (/api/respond or /api/tick). With
 * `queueTopLevel`, new top-level posts wait behind the pill; replies always
 * attach to their thread.
 */
export function applyLiveEvent(feed: Feed, event: StreamEvent, now: number, queueTopLevel: boolean): Feed {
  switch (event.type) {
    case "typing":
      return { ...feed, typing: [...feed.typing, { handle: event.handle, replyToId: event.replyToId }] };
    case "skip":
      return { ...feed, typing: withoutTyping(feed.typing, event.handle, event.replyToId) };
    case "post": {
      const post = toClient(event.post, now);
      const typing = withoutTyping(feed.typing, post.author, post.replyToId);
      if (!post.replyToId && queueTopLevel) return { ...feed, typing, queued: [...feed.queued, post] };
      return { ...feed, typing, posts: [...feed.posts, post] };
    }
    case "error":
      return { ...feed, notice: event.message };
    default:
      return feed;
  }
}

/** Clears typing placeholders left behind by a cancelled or failed live request. */
export function clearTyping(feed: Feed, typing: readonly Typing[]): Feed {
  let next = feed.typing;
  for (const t of typing) next = withoutTyping(next, t.handle, t.replyToId);
  return next === feed.typing ? feed : { ...feed, typing: next };
}

export function addPost(feed: Feed, post: ClientPost): Feed {
  return { ...feed, posts: [...feed.posts, post] };
}

export function showQueued(feed: Feed): Feed {
  return feed.queued.length ? { ...feed, posts: [...feed.posts, ...feed.queued], queued: [] } : feed;
}

export interface Thread {
  root: ClientPost;
  replies: ClientPost[];
}

/** Top-level posts newest first, each with its replies oldest first. */
export function buildThreads(posts: readonly ClientPost[]): Thread[] {
  const byRoot = new Map<string, ClientPost[]>();
  for (const p of posts) {
    if (!p.rootId) continue;
    const list = byRoot.get(p.rootId) ?? [];
    list.push(p);
    byRoot.set(p.rootId, list);
  }
  return posts
    .filter((p) => !p.rootId)
    .sort((a, b) => b.createdAt - a.createdAt)
    .map((root) => ({ root, replies: (byRoot.get(root.id) ?? []).sort((a, b) => a.createdAt - b.createdAt) }));
}

export function replyCount(posts: readonly ClientPost[], post: ClientPost): number {
  return posts.filter((p) => (post.rootId ? p.replyToId === post.id : p.rootId === post.id)).length;
}

function toWire(post: ClientPost, now: number): WirePost {
  const { id, author, text, replyToId, rootId } = post;
  return { id, author, text, replyToId, rootId, minutesAgo: Math.min(1_000_000, Math.max(0, Math.floor((now - post.createdAt) / 60_000))) };
}

/**
 * The posts sent to the server as context: the thread of `focus` (if any)
 * plus the most recent other posts, oldest first, capped for the request schema.
 */
export function contextPosts(feed: Feed, now: number, focus?: ClientPost): WirePost[] {
  const all = [...feed.posts, ...feed.queued].sort((a, b) => a.createdAt - b.createdAt);
  const rootId = focus ? (focus.rootId ?? focus.id) : null;
  const thread = rootId ? all.filter((p) => p.id === rootId || p.rootId === rootId) : [];
  const threadIds = new Set(thread.map((p) => p.id));
  const others = all.filter((p) => !threadIds.has(p.id) && p.id !== focus?.id);
  const room = Math.max(0, MAX_CONTEXT_POSTS - thread.length);
  const picked = [...thread.slice(-MAX_CONTEXT_POSTS), ...others.slice(-room)].sort((a, b) => a.createdAt - b.createdAt);
  return picked.map((p) => toWire(p, now));
}

/** Keeps the most recently visited ready feeds, for memory and localStorage. */
export function pruneFeeds(feeds: Record<number, Feed>, keep: number = MAX_CACHED_FEEDS): Record<number, Feed> {
  const entries = Object.values(feeds).sort((a, b) => b.visitedAt - a.visitedAt);
  if (entries.length <= keep) return feeds;
  return Object.fromEntries(entries.slice(0, keep).map((f) => [f.year, f]));
}

/** What is persisted for a feed: settled content only, no transient state. */
export function serializableFeeds(feeds: Record<number, Feed>): Feed[] {
  return Object.values(pruneFeeds(feeds))
    .filter((f) => f.status === "ready")
    .map((f) => ({ ...f, posts: [...f.posts, ...f.queued], queued: [], typing: [], notice: null }));
}

/** Validates feeds read back from localStorage; anything odd is dropped. */
export function restoreFeeds(raw: unknown): Feed[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter(
    (f): f is Feed =>
      typeof f === "object" &&
      f !== null &&
      Number.isInteger(f.year) &&
      f.status === "ready" &&
      Array.isArray(f.posts) &&
      Array.isArray(f.cast) &&
      typeof f.era === "object" &&
      f.era !== null,
  );
}

/* ------------------------------------------------------------------------ */
/* All visited feeds, keyed by year                                          */
/* ------------------------------------------------------------------------ */

export type Feeds = Record<number, Feed>;

export type FeedsAction =
  /** Begin a fresh generation for a year (replaces any cached feed). */
  | { type: "start"; year: number; now: number }
  /** Revisit a cached year. */
  | { type: "touch"; year: number; now: number }
  | { type: "director"; year: number; event: StreamEvent; now: number }
  | { type: "live"; year: number; event: StreamEvent; now: number; queue: boolean }
  | { type: "clear-typing"; year: number; typing: Typing[] }
  | { type: "add-post"; year: number; post: ClientPost }
  | { type: "show-queued"; year: number };

function update(feeds: Feeds, year: number, fn: (feed: Feed) => Feed): Feeds {
  const feed = feeds[year];
  if (!feed) return feeds;
  const next = fn(feed);
  return next === feed ? feeds : { ...feeds, [year]: next };
}

export function feedsReducer(feeds: Feeds, action: FeedsAction): Feeds {
  switch (action.type) {
    case "start":
      return pruneFeeds({ ...feeds, [action.year]: emptyFeed(action.year, action.now) });
    case "touch":
      return update(feeds, action.year, (f) => ({ ...f, visitedAt: action.now }));
    case "director":
      return update(feeds, action.year, (f) => applyDirectorEvent(f, action.event, action.now));
    case "live":
      return update(feeds, action.year, (f) => applyLiveEvent(f, action.event, action.now, action.queue));
    case "clear-typing":
      return update(feeds, action.year, (f) => clearTyping(f, action.typing));
    case "add-post":
      return update(feeds, action.year, (f) => addPost({ ...f, notice: null }, action.post));
    case "show-queued":
      return update(feeds, action.year, showQueued);
  }
}
