import { feedRequestSchema } from "@/lib/schemas";
import { runDirector } from "@/server/agents";
import { ndjsonResponse, parseBody } from "@/server/http";

/** POST /api/feed { year, count } -> NDJSON: era, persona, post..., done | error */
export async function POST(request: Request): Promise<Response> {
  const body = await parseBody(request, feedRequestSchema);
  if (!body.ok) return body.response;
  const { year, count } = body.data;
  return ndjsonResponse(request, (signal) => runDirector(year, count, signal));
}
