"use client";

import { useCallback, useEffect, useReducer, useRef, useState, useSyncExternalStore, type CSSProperties } from "react";
import { isAbortError, makeId, streamEvents } from "@/lib/client-api";
import { bandForYear, formatYear } from "@/lib/eras";
import { contextPosts, emptyFeed, feedsReducer, type ClientPost, type Feeds, type Typing } from "@/lib/feed-state";
import { loadFeeds, loadSettings, saveFeeds, saveSettings, type Settings } from "@/lib/storage";
import { USER_HANDLE, type StreamEvent, type WirePost } from "@/lib/types";
import { Composer } from "./Composer";
import { Controls } from "./Controls";
import { EraInfo } from "./EraInfo";
import { Feed } from "./Feed";
import { CloseIcon, SettingsIcon } from "./icons";
import { TimelineBar } from "./TimelineBar";

/** Background activity cadence and the per-visit cap that protects an idle tab's bill. */
const TICK_MS = 45_000;
const MAX_TICKS_PER_VISIT = 8;

/* ------------------------------------------------------------------------ */
/* Small external stores (no setState in effects)                            */
/* ------------------------------------------------------------------------ */

const noopSubscribe = () => () => {};

function useMounted(): boolean {
  return useSyncExternalStore(
    noopSubscribe,
    () => true,
    () => false,
  );
}

/** A clock that ticks every 30 s, for relative timestamps. 0 on the server. */
function useNow(): number {
  return useSyncExternalStore(
    (onChange) => {
      const id = setInterval(onChange, 30_000);
      return () => clearInterval(id);
    },
    () => Math.floor(Date.now() / 30_000) * 30_000,
    () => 0,
  );
}

function usePageVisible(): boolean {
  return useSyncExternalStore(
    (onChange) => {
      document.addEventListener("visibilitychange", onChange);
      return () => document.removeEventListener("visibilitychange", onChange);
    },
    () => document.visibilityState === "visible",
    () => false,
  );
}

/* ------------------------------------------------------------------------ */

/** Renders a static shell on the server, then the app once in the browser. */
export function Chronofeed() {
  const mounted = useMounted();
  if (!mounted) return <Shell />;
  return <ChronofeedApp {...initialState()} />;
}

function initialState(): { year: number; feeds: Feeds; settings: Settings } {
  const year = new Date().getFullYear();
  const now = Date.now();
  const feeds: Feeds = Object.fromEntries(loadFeeds().map((f) => [f.year, f]));
  if (feeds[year]) feeds[year] = { ...feeds[year], visitedAt: now };
  else feeds[year] = emptyFeed(year, now);
  return { year, feeds, settings: loadSettings() };
}

function Shell() {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line px-4 py-4">
        <div className="mx-auto max-w-[1265px]">
          <p className="font-serif text-[32px] leading-tight">Chronofeed</p>
          <p className="text-[13px] text-muted">The social feed of any year, from 3000 BCE to 2500 CE.</p>
        </div>
      </header>
      <main className="mx-auto max-w-[600px] px-4 py-6 text-[13px] text-muted">
        <p>Tuning in…</p>
        <p className="mt-4">Everything here is AI-generated fiction. Posts attributed to historical figures are imagined, not real quotes.</p>
      </main>
    </div>
  );
}

function toWire({ id, author, text, replyToId, rootId }: ClientPost): WirePost {
  return { id, author, text, replyToId, rootId, minutesAgo: 0 };
}

function ChronofeedApp({ year: initialYear, feeds: initialFeeds, settings }: { year: number; feeds: Feeds; settings: Settings }) {
  const [year, setYear] = useState(initialYear);
  const [preview, setPreview] = useState<number | null>(null);
  const [dragging, setDragging] = useState(false);
  const [feeds, dispatch] = useReducer(feedsReducer, initialFeeds);
  const [count, setCount] = useState(settings.count);
  const [live, setLive] = useState(settings.live);
  const [ticks, setTicks] = useState(0);
  const [liked, setLiked] = useState<ReadonlySet<string>>(() => new Set());
  const [replyingTo, setReplyingTo] = useState<string | null>(null);
  const settingsDialog = useRef<HTMLDialogElement>(null);

  const now = useNow();
  const visible = usePageVisible();

  const feedsRef = useRef(feeds);
  const yearRef = useRef(year);
  const countRef = useRef(count);
  /** Every in-flight request for the current year; aborted when the year changes. */
  const controllers = useRef(new Set<AbortController>());

  useEffect(() => {
    feedsRef.current = feeds;
    yearRef.current = year;
    countRef.current = count;
  });

  // Persist settled feeds (most recent 12) whenever they change.
  useEffect(() => saveFeeds(feeds), [feeds]);

  const abortAll = () => {
    for (const c of controllers.current) c.abort();
    controllers.current.clear();
  };

  /** Streams the director's opening feed for `target` into state. */
  const fetchFeed = useCallback((target: number) => {
    const controller = new AbortController();
    controllers.current.add(controller);
    const onEvent = (event: StreamEvent) => dispatch({ type: "director", year: target, event, now: Date.now() });
    streamEvents("/api/feed", { year: target, count: countRef.current }, controller.signal, onEvent)
      .catch((error: unknown) => {
        if (!isAbortError(error)) onEvent({ type: "error", code: "network", message: "Lost the connection while generating." });
      })
      .finally(() => controllers.current.delete(controller));
    return controller;
  }, []);

  /** Runs a persona request (/api/respond or /api/tick) for `target` year. */
  const liveRequest = useCallback((path: string, body: unknown, target: number, queue: boolean) => {
    const controller = new AbortController();
    controllers.current.add(controller);
    const pending: Typing[] = [];
    const onEvent = (event: StreamEvent) => {
      if (event.type === "typing") pending.push({ handle: event.handle, replyToId: event.replyToId });
      if (event.type === "skip" || event.type === "post") {
        const handle = event.type === "post" ? event.post.author : event.handle;
        const replyToId = event.type === "post" ? event.post.replyToId : event.replyToId;
        const i = pending.findIndex((t) => t.handle === handle && t.replyToId === replyToId);
        if (i !== -1) pending.splice(i, 1);
      }
      dispatch({ type: "live", year: target, event, now: Date.now(), queue });
    };
    streamEvents(path, body, controller.signal, onEvent)
      .catch((error: unknown) => {
        if (!isAbortError(error)) onEvent({ type: "error", code: "network", message: "Could not reach the agents." });
      })
      .finally(() => {
        controllers.current.delete(controller);
        if (pending.length) dispatch({ type: "clear-typing", year: target, typing: [...pending] });
      });
  }, []);

  // Generate the starting year on first load if it was not cached.
  useEffect(() => {
    if (feedsRef.current[yearRef.current]?.status !== "loading") return;
    const controller = fetchFeed(yearRef.current);
    return () => controller.abort();
  }, [fetchFeed]);

  /** Moves the feed to `target`: reuses the cached feed unless forced. */
  const travel = useCallback(
    (target: number, force = false) => {
      abortAll();
      setPreview(null);
      setYear(target);
      setTicks(0);
      setReplyingTo(null);
      const cached = feedsRef.current[target];
      if (!force && cached?.status === "ready") {
        dispatch({ type: "touch", year: target, now: Date.now() });
        return;
      }
      dispatch({ type: "start", year: target, now: Date.now() });
      fetchFeed(target);
    },
    [fetchFeed],
  );

  const feed = feeds[year] ?? emptyFeed(year, 0);
  const paused = ticks >= MAX_TICKS_PER_VISIT;

  // Background activity while Live is on, the tab is visible and the feed is ready.
  useEffect(() => {
    if (!live || !visible || paused || feed.status !== "ready") return;
    const id = setInterval(() => {
      const current = feedsRef.current[yearRef.current];
      if (!current?.era || current.status !== "ready") return;
      setTicks((t) => t + 1);
      liveRequest("/api/tick", { era: current.era, cast: current.cast, posts: contextPosts(current, Date.now()) }, current.year, true);
    }, TICK_MS);
    return () => clearInterval(id);
  }, [live, visible, paused, feed.status, liveRequest]);

  const submitPost = (text: string, target: ClientPost | null) => {
    const current = feedsRef.current[year];
    if (!current?.era || current.status !== "ready") return;
    const userPost: ClientPost = {
      id: makeId(),
      author: USER_HANDLE,
      text,
      minutesAgo: 0,
      replyToId: target?.id ?? null,
      rootId: target ? (target.rootId ?? target.id) : null,
      createdAt: Date.now(),
    };
    dispatch({ type: "add-post", year, post: userPost });
    setReplyingTo(null);
    const withUser = { ...current, posts: [...current.posts, userPost] };
    liveRequest("/api/respond", { era: current.era, cast: current.cast, posts: contextPosts(withUser, Date.now(), userPost), userPost: toWire(userPost) }, year, false);
  };

  const updateSettings = (next: Partial<Settings>) => {
    const merged = { count, live, ...next };
    setCount(merged.count);
    setLive(merged.live);
    saveSettings(merged);
  };

  const toggleLike = (id: string) =>
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  const shownYear = preview ?? year;
  const band = bandForYear(shownYear);
  const ready = feed.status === "ready";
  const controls = (
    <Controls
      count={count}
      onCountChange={(c) => updateSettings({ count: c })}
      live={live}
      onLiveChange={(l) => updateSettings({ live: l })}
      paused={paused}
      onResume={() => setTicks(0)}
      onRegenerate={() => travel(year, true)}
      busy={feed.status === "loading"}
    />
  );

  return (
    <div className="era-scope min-h-dvh" style={{ "--accent": band.accent, "--accent-ink-dark": band.accentInkDark } as CSSProperties}>
      <TimelineBar year={year} preview={preview} onPreview={setPreview} onDraggingChange={setDragging} onCommit={(y) => travel(y)} />

      <div className="mx-auto flex max-w-[1265px] justify-center">
        {/* Left rail */}
        <aside className="sticky top-[var(--bar-h,96px)] hidden h-[calc(100dvh-var(--bar-h,96px))] w-[240px] shrink-0 self-start overflow-y-auto px-4 py-5 min-[1000px]:block">
          <div className="mb-6">
            <p className="font-serif text-[24px] leading-tight">Chronofeed</p>
            <p className="text-[13px] text-muted">The feed, any year.</p>
          </div>
          {controls}
        </aside>

        {/* Feed */}
        <main className="w-full min-w-0 max-w-[600px] border-line min-[600px]:border-x" aria-label={`Feed for ${formatYear(year)}`}>
          <div className="flex items-center justify-between gap-3 border-b border-line px-4 py-2.5 min-[1000px]:hidden">
            <div className="min-w-0">
              <p className="font-serif text-[20px] leading-tight">Chronofeed</p>
              {feed.era && <p className="truncate text-[13px] text-muted">{feed.era.label}</p>}
            </div>
            <button
              type="button"
              onClick={() => settingsDialog.current?.showModal()}
              aria-label="Feed settings"
              className="grid size-9 shrink-0 place-items-center rounded-full text-muted outline-none hover:bg-surface hover:text-fg focus-visible:ring-2 focus-visible:ring-accent"
            >
              <SettingsIcon />
            </button>
          </div>

          {live && paused && ready && (
            <p className="border-b border-line px-4 py-2 text-[13px] text-muted">
              Live paused to save tokens —{" "}
              <button type="button" onClick={() => setTicks(0)} className="font-medium text-accent-ink hover:underline">
                resume
              </button>
            </p>
          )}

          <Composer key={year} placeholder={`What's happening in ${formatYear(year)}?`} submitLabel="Post" disabled={!ready} onSubmit={(text) => submitPost(text, null)} />

          <div className="relative">
            <div className={`transition-opacity duration-150 ${dragging ? "pointer-events-none opacity-30" : ""}`} aria-hidden={dragging || undefined}>
              <Feed
                feed={feed}
                now={now}
                liked={liked}
                replyingTo={replyingTo}
                onToggleLike={toggleLike}
                onOpenReply={setReplyingTo}
                onReply={(target, text) => submitPost(text, target)}
                onShowQueued={() => {
                  dispatch({ type: "show-queued", year });
                  window.scrollTo({ top: 0, behavior: "smooth" });
                }}
                onRetry={() => travel(year, true)}
              />
            </div>
            {dragging && (
              <div className="pointer-events-none absolute inset-x-0 top-24 flex justify-center" role="status">
                <span className="rounded-full bg-accent px-4 py-2 text-[14px] font-semibold text-white">Release to travel to {formatYear(shownYear)}</span>
              </div>
            )}
          </div>

          {/* Trends and voices move under the feed on narrow screens */}
          <div className="border-t border-line px-4 py-5 min-[1000px]:hidden">
            <EraInfo year={year} era={feed.era} cast={feed.cast} />
          </div>
        </main>

        {/* Right rail */}
        <aside className="sticky top-[var(--bar-h,96px)] hidden h-[calc(100dvh-var(--bar-h,96px))] w-[340px] shrink-0 self-start overflow-y-auto px-5 py-4 min-[1000px]:block">
          <EraInfo year={year} era={feed.era} cast={feed.cast} />
        </aside>
      </div>

      {/* Settings sheet for narrow screens */}
      <dialog
        ref={settingsDialog}
        aria-label="Feed settings"
        className="m-0 mt-auto w-full max-w-none rounded-t-2xl bg-bg p-0 text-fg sm:m-auto sm:max-w-sm sm:rounded-2xl"
        onClick={(e) => {
          if (e.target === e.currentTarget) e.currentTarget.close();
        }}
      >
        <div className="p-5">
          <div className="mb-4 flex items-center justify-between">
            <h2 className="text-[17px] font-bold">Settings</h2>
            <button
              type="button"
              onClick={() => settingsDialog.current?.close()}
              aria-label="Close settings"
              className="grid size-9 place-items-center rounded-full text-muted outline-none hover:bg-surface focus-visible:ring-2 focus-visible:ring-accent"
            >
              <CloseIcon />
            </button>
          </div>
          {controls}
        </div>
      </dialog>
    </div>
  );
}
