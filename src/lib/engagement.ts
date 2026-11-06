import { hashString } from "./color";

export interface Engagement {
  likes: number;
  reposts: number;
}

/**
 * Like and repost counts synthesized from the author's clout. Deterministic
 * per post id, so a cached feed shows the same numbers. Replies get less.
 */
export function engagementFor(postId: string, clout: number, isReply: boolean): Engagement {
  const h = hashString(postId);
  const jitter = (h % 1000) / 1000; // 0..1
  const base = 4 * 6 ** (Math.min(5, Math.max(1, clout)) - 1); // 4, 24, 144, 864, 5184
  const scale = isReply ? 0.15 : 1;
  const likes = Math.round(base * (0.5 + jitter * 1.5) * scale);
  const reposts = Math.round(likes * (0.05 + ((h >>> 10) % 100) / 1000));
  return { likes, reposts };
}
