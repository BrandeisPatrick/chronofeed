import { tickRequestSchema } from "@/lib/schemas";
import { pickTickActions } from "@/lib/selection";
import { runPersonaJobs, type PersonaJob } from "@/server/agents";
import { ndjsonResponse, parseBody } from "@/server/http";

/**
 * POST /api/tick { era, cast, posts } -> NDJSON: typing..., post | skip..., done | error
 *
 * Background activity: 1-2 personas post something new or reply to another
 * persona's recent post.
 */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, tickRequestSchema);
  if (!body.ok) return body.response;
  const { era, cast, posts } = body.data;

  const jobs: PersonaJob[] = pickTickActions(cast, posts, Math.random).map((action) => ({
    persona: action.persona,
    era,
    cast,
    posts,
    target: action.kind === "reply" ? action.target : null,
  }));

  return ndjsonResponse(request, (signal) => runPersonaJobs(jobs, signal));
}
