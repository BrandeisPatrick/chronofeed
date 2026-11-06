"use client";

import { useMemo } from "react";
import { formatYear } from "@/lib/eras";
import { buildThreads, replyCount, type ClientPost, type Feed as FeedData } from "@/lib/feed-state";
import type { Persona } from "@/lib/types";
import { Composer } from "./Composer";
import { ErrorCard } from "./ErrorCard";
import { PostCard, SkeletonCard, TypingCard, USER_PERSONA } from "./PostCard";

interface FeedProps {
  feed: FeedData;
  now: number;
  liked: ReadonlySet<string>;
  replyingTo: string | null;
  onToggleLike(id: string): void;
  onOpenReply(id: string | null): void;
  onReply(target: ClientPost, text: string): void;
  onShowQueued(): void;
  onRetry(): void;
}

const UNKNOWN: Persona = { handle: "unknown", name: "Unknown", bio: "", location: "", avatar: "❔", kind: "fictional", voice: "", clout: 1 };

export function Feed({ feed, now, liked, replyingTo, onToggleLike, onOpenReply, onReply, onShowQueued, onRetry }: FeedProps) {
  const people = useMemo(() => new Map(feed.cast.map((p) => [p.handle, p])), [feed.cast]);
  const personaFor = (handle: string) => (handle === USER_PERSONA.handle ? USER_PERSONA : (people.get(handle) ?? { ...UNKNOWN, handle }));
  const threads = useMemo(() => buildThreads(feed.posts), [feed.posts]);
  const byId = useMemo(() => new Map(feed.posts.map((p) => [p.id, p])), [feed.posts]);
  const via = feed.era?.via ?? "";

  if (feed.status === "error" && feed.error) {
    return <ErrorCard code={feed.error.code} message={feed.error.message} onRetry={onRetry} />;
  }

  const topLevelTyping = feed.typing.filter((t) => t.replyToId === null);
  const rootOf = (id: string) => {
    const p = byId.get(id);
    return p ? (p.rootId ?? p.id) : null;
  };

  const renderCard = (post: ClientPost, isReply: boolean, rootAuthor?: string) => {
    const parent = post.replyToId ? byId.get(post.replyToId) : undefined;
    return (
      <div key={post.id}>
        <PostCard
          post={post}
          author={personaFor(post.author)}
          via={via}
          now={now}
          replies={replyCount(feed.posts, post)}
          liked={liked.has(post.id)}
          isReply={isReply}
          replyingTo={parent && parent.author !== rootAuthor ? parent.author : undefined}
          onLike={() => onToggleLike(post.id)}
          onReply={() => onOpenReply(replyingTo === post.id ? null : post.id)}
        />
        {replyingTo === post.id && (
          <div className={isReply ? "pl-11" : "pl-[52px]"}>
            <Composer
              compact
              autoFocus
              placeholder={`Reply to @${post.author}`}
              submitLabel="Reply"
              onSubmit={(text) => onReply(post, text)}
              onCancel={() => onOpenReply(null)}
            />
          </div>
        )}
      </div>
    );
  };

  return (
    <div>
      {feed.queued.length > 0 && (
        <div className="sticky top-[calc(var(--bar-h,96px)+8px)] z-20 flex justify-center py-2">
          <button
            type="button"
            onClick={onShowQueued}
            className="rounded-full bg-accent px-4 py-1.5 text-[14px] font-semibold text-white shadow-sm outline-none focus-visible:ring-2 focus-visible:ring-accent focus-visible:ring-offset-2 focus-visible:ring-offset-bg"
          >
            Show {feed.queued.length} new {feed.queued.length === 1 ? "post" : "posts"}
          </button>
        </div>
      )}

      {feed.notice && (
        <p role="status" className="border-b border-line px-4 py-2 text-[13px] text-muted">
          {feed.notice}
        </p>
      )}

      {topLevelTyping.map((t) => (
        <div key={`typing-${t.handle}`} className="border-b border-line px-4 py-3">
          <TypingCard author={personaFor(t.handle)} />
        </div>
      ))}

      {threads.map(({ root, replies }) => {
        const typing = feed.typing.filter((t) => t.replyToId && rootOf(t.replyToId) === root.id);
        return (
          <div key={root.id} className="border-b border-line px-4 py-3">
            {renderCard(root, false)}
            {(replies.length > 0 || typing.length > 0) && (
              <div className="mt-3 ml-[52px] space-y-3 border-l border-line pl-3">
                {replies.map((r) => renderCard(r, true, root.author))}
                {typing.map((t, i) => (
                  <TypingCard key={`${t.handle}-${i}`} author={personaFor(t.handle)} small />
                ))}
              </div>
            )}
          </div>
        );
      })}

      {feed.status === "loading" && (
        <>
          <p role="status" className="px-4 py-3 text-[13px] text-muted">
            Agents are tuning in to {formatYear(feed.year)}…
          </p>
          {Array.from({ length: feed.posts.length ? 2 : 4 }, (_, i) => (
            <SkeletonCard key={i} />
          ))}
        </>
      )}

      {feed.status === "ready" && threads.length === 0 && <p className="px-4 py-10 text-center text-[15px] text-muted">The feed is quiet. Say something.</p>}
    </div>
  );
}
