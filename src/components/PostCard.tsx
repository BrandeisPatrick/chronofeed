"use client";

import { engagementFor } from "@/lib/engagement";
import type { ClientPost } from "@/lib/feed-state";
import { compactNumber, relativeTime } from "@/lib/text";
import { USER_HANDLE, type Persona } from "@/lib/types";
import { Avatar } from "./Avatar";
import { HeartIcon, ReplyIcon, RepostIcon } from "./icons";

export const USER_PERSONA: Persona = {
  handle: USER_HANDLE,
  name: "You",
  bio: "A stranger with peculiar knowledge.",
  location: "Somewhen else",
  avatar: "🧭",
  kind: "fictional",
  voice: "",
  clout: 1,
};

interface PostCardProps {
  post: ClientPost;
  author: Persona;
  via: string;
  now: number;
  replies: number;
  liked: boolean;
  isReply?: boolean;
  /** The handle this post answers, shown as "Replying to @x" when it is not the thread root's author. */
  replyingTo?: string;
  onLike(): void;
  onReply(): void;
}

export function PostCard({ post, author, via, now, replies, liked, isReply, replyingTo, onLike, onReply }: PostCardProps) {
  const isUser = post.author === USER_HANDLE;
  const base = isUser ? { likes: 0, reposts: 0 } : engagementFor(post.id, author.clout, Boolean(isReply));
  const likes = base.likes + (liked ? 1 : 0);
  const time = now ? relativeTime(post.createdAt, now) : "";

  return (
    <article className="post-enter flex gap-3" aria-label={`${author.name}: ${post.text}`}>
      <Avatar emoji={author.avatar} handle={author.handle} size={isReply ? 32 : 40} />
      <div className="min-w-0 flex-1">
        <header className="flex min-w-0 items-baseline gap-1 text-[15px] leading-5">
          <span className="truncate font-semibold">{author.name}</span>
          <span className="truncate text-[13px] text-muted">@{author.handle}</span>
          {time && (
            <>
              <span className="text-[13px] text-muted" aria-hidden="true">
                ·
              </span>
              <span className="shrink-0 text-[13px] text-muted">{time}</span>
            </>
          )}
        </header>
        {replyingTo && (
          <p className="text-[13px] text-muted">
            Replying to <span className="text-accent-ink">@{replyingTo}</span>
          </p>
        )}
        <p className="mt-0.5 text-[15px] leading-[1.4] break-words whitespace-pre-wrap">{post.text}</p>
        <p className="mt-1 text-[13px] text-muted">{isUser ? "via time machine" : via}</p>
        <div className="mt-1.5 -ml-2 flex max-w-sm items-center justify-between text-[13px] text-muted">
          <button
            type="button"
            onClick={onReply}
            aria-label={`Reply${replies ? `, ${replies} replies` : ""}`}
            className="flex items-center gap-1.5 rounded-full px-2 py-1 outline-none hover:text-accent-ink focus-visible:ring-2 focus-visible:ring-accent"
          >
            <ReplyIcon />
            <span className="tabular-nums">{replies || ""}</span>
          </button>
          <span className="flex items-center gap-1.5 px-2 py-1" aria-label={`${base.reposts} reposts`}>
            <RepostIcon />
            <span className="tabular-nums">{base.reposts ? compactNumber(base.reposts) : ""}</span>
          </span>
          <button
            type="button"
            onClick={onLike}
            aria-pressed={liked}
            aria-label={`Like, ${likes} likes`}
            className={`flex items-center gap-1.5 rounded-full px-2 py-1 outline-none hover:text-accent-ink focus-visible:ring-2 focus-visible:ring-accent ${liked ? "text-accent-ink" : ""}`}
          >
            <HeartIcon filled={liked} />
            <span className="tabular-nums">{likes ? compactNumber(likes) : ""}</span>
          </button>
          <span className="w-8" aria-hidden="true" />
        </div>
      </div>
    </article>
  );
}

export function TypingCard({ author, small }: { author: Persona; small?: boolean }) {
  return (
    <div className="post-enter flex items-center gap-3" role="status" aria-label={`${author.name} is typing`}>
      <Avatar emoji={author.avatar} handle={author.handle} size={small ? 32 : 40} />
      <div className="flex items-center gap-2 text-[13px] text-muted">
        <span className="font-medium text-fg">{author.name}</span>
        <span>is typing</span>
        <span className="flex gap-0.5" aria-hidden="true">
          <span className="typing-dot size-1 rounded-full bg-muted" />
          <span className="typing-dot size-1 rounded-full bg-muted" />
          <span className="typing-dot size-1 rounded-full bg-muted" />
        </span>
      </div>
    </div>
  );
}

export function SkeletonCard() {
  return (
    <div className="flex gap-3 border-b border-line px-4 py-4" aria-hidden="true">
      <span className="skeleton size-10 shrink-0 rounded-full" />
      <div className="flex-1 space-y-2 pt-1">
        <span className="skeleton block h-3 w-1/3 rounded" />
        <span className="skeleton block h-3 w-full rounded" />
        <span className="skeleton block h-3 w-4/5 rounded" />
      </div>
    </div>
  );
}
