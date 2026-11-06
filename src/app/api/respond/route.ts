import { respondRequestSchema } from "@/lib/schemas";
import { pickResponders } from "@/lib/selection";
import { runPersonaJobs, type PersonaJob } from "@/server/agents";
import { ndjsonResponse, parseBody } from "@/server/http";

/**
 * POST /api/respond { era, cast, posts, userPost } -> NDJSON: typing..., post | skip..., done | error
 *
 * The user commented on a post (or wrote a top-level post). The author of the
 * post being answered always replies; a few others may chime in.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, respondRequestSchema);
  if (!body.ok) return body.response;
  const { era, cast, posts, userPost } = body.data;

  const parent = userPost.replyToId ? posts.find((p) => p.id === userPost.replyToId) : undefined;
  const context = posts.some((p) => p.id === userPost.id) ? posts : [...posts, userPost];
  const jobs: PersonaJob[] = pickResponders(cast, parent?.author ?? null, Math.random).map((persona) => ({
    persona,
    era,
    cast,
    posts: context,
    target: userPost,
  }));

  return ndjsonResponse(request, (signal) => runPersonaJobs(jobs, signal));
}
