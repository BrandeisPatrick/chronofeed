import "server-only";

import { randomUUID } from "node:crypto";
import { DirectorAssembler } from "@/lib/director";
import { isMockMode, DIRECTOR_MAX_TOKENS, PERSONA_MAX_TOKENS } from "@/lib/models";
import { mockDirectorLines, mockPersonaText } from "@/lib/mock";
import { createLineSplitter } from "@/lib/ndjson";
import {
  DIRECTOR_SYSTEM,
  directorUserMessage,
  newPostUserMessage,
  personaSystem,
  replyUserMessage,
} from "@/lib/prompts";
import { MAX_CAST } from "@/lib/schemas";
import { cleanPostText } from "@/lib/text";
import type { EraBrief, Persona, StreamEvent, WirePost } from "@/lib/types";
import { classifyError, modelConfig, streamText, type TextChunk } from "./claude";

/** Delay between mock events, so mock mode streams like the real thing. */
export const MOCK_DELAY_MS = 150;

export function sleep(ms: number, signal: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal.aborted) return reject(signal.reason);
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      reject(signal.reason);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}

async function* mockChunks(lines: string[], signal: AbortSignal): AsyncGenerator<TextChunk> {
  for (const line of lines) {
    await sleep(MOCK_DELAY_MS, signal);
    yield { type: "text", text: `${line}\n` };
  }
  yield { type: "stop", reason: "end_turn" };
}

/* ------------------------------------------------------------------------ */
/* Director                                                                  */
/* ------------------------------------------------------------------------ */

/**
 * Runs the director for one year and yields stream events as complete JSONL
 * lines arrive. Always ends with `done`, or with an `error` event.
 */
export async function* runDirector(year: number, count: number, signal: AbortSignal): AsyncGenerator<StreamEvent> {
  const assembler = new DirectorAssembler({ year, count, idPrefix: `${year}-${randomUUID().slice(0, 8)}`, maxCast: MAX_CAST });
  const splitter = createLineSplitter();
  const chunks = isMockMode()
    ? mockChunks(mockDirectorLines(year, count), signal)
    : streamText(
        { model: modelConfig().directorModel, maxTokens: DIRECTOR_MAX_TOKENS, system: [DIRECTOR_SYSTEM], user: directorUserMessage(year, count) },
        signal,
      );

  let stopReason: string | null = null;
  try {
    for await (const chunk of chunks) {
      if (chunk.type === "stop") {
        stopReason = chunk.reason;
        break;
      }
      for (const line of splitter.push(chunk.text)) yield* assembler.accept(line);
    }
    for (const line of splitter.flush()) yield* assembler.accept(line);
  } catch (error) {
    const classified = classifyError(error);
    if (!classified.aborted) yield { type: "error", code: classified.code, message: classified.message };
    return;
  }

  if (stopReason === "refusal") {
    yield { type: "error", code: "refusal", message: "The director declined to write this era. Try another year or regenerate." };
    return;
  }
  if (assembler.topLevelCount === 0) {
    yield { type: "error", code: "empty", message: "The director returned no usable posts. Try regenerating." };
    return;
  }
  yield { type: "done" };
}

/* ------------------------------------------------------------------------ */
/* Persona agents                                                            */
/* ------------------------------------------------------------------------ */

export interface PersonaJob {
  persona: Persona;
  era: EraBrief;
  cast: readonly Persona[];
  /** Recent feed posts, oldest first (thread context and the persona's memory). */
  posts: readonly WirePost[];
  /** The post being answered; null for a new top-level post. */
  target: WirePost | null;
}

/** Posts in `target`'s thread, oldest first, ending at most 20 posts back. */
export function threadFor(target: WirePost, posts: readonly WirePost[]): WirePost[] {
  const rootId = target.rootId ?? target.id;
  const thread = posts.filter((p) => p.id === rootId || p.rootId === rootId);
  if (!thread.some((p) => p.id === target.id)) thread.push(target);
  return thread.slice(-20);
}

/** Runs one persona agent. Returns the post text, or null if it refused or said nothing. */
export async function runPersona(job: PersonaJob, signal: AbortSignal): Promise<string | null> {
  const { persona, era, cast, posts, target } = job;
  if (isMockMode()) {
    // Staggered, deterministic delays so typing placeholders are visible.
    await sleep(MOCK_DELAY_MS * (4 + (persona.handle.length % 6)), signal);
    return mockPersonaText(persona, era, target, `${persona.handle}:${target?.id ?? posts.length}`);
  }
  const { rules, card } = personaSystem(persona, era);
  const user = target
    ? replyUserMessage({ persona, cast, thread: threadFor(target, posts), target, posts })
    : newPostUserMessage({ persona, cast, posts });

  let text = "";
  let stopReason: string | null = null;
  for await (const chunk of streamText({ model: modelConfig().personaModel, maxTokens: PERSONA_MAX_TOKENS, system: [rules, card], user }, signal)) {
    if (chunk.type === "text") text += chunk.text;
    else stopReason = chunk.reason;
  }
  // A refusal is "skip this item": any partial text is discarded.
  if (stopReason === "refusal") return null;
  const cleaned = cleanPostText(text, persona.handle);
  return cleaned || null;
}

/**
 * Runs several persona jobs in parallel and yields a `typing` event for each
 * up front, then a `post` (or `skip`) as each finishes, in completion order.
 * If every job fails with an API error, ends with that `error`.
 */
export async function* runPersonaJobs(jobs: PersonaJob[], signal: AbortSignal): AsyncGenerator<StreamEvent> {
  for (const job of jobs) yield { type: "typing", handle: job.persona.handle, replyToId: job.target?.id ?? null };

  type Outcome = { index: number; event: StreamEvent; error?: ReturnType<typeof classifyError> };
  const pending = new Map<number, Promise<Outcome>>();
  jobs.forEach((job, index) => {
    const replyToId = job.target?.id ?? null;
    const skip: StreamEvent = { type: "skip", handle: job.persona.handle, replyToId };
    pending.set(
      index,
      runPersona(job, signal).then(
        (text): Outcome => {
          if (!text) return { index, event: skip };
          const post: WirePost = {
            id: randomUUID(),
            author: job.persona.handle,
            text,
            minutesAgo: 0,
            replyToId,
            rootId: job.target ? (job.target.rootId ?? job.target.id) : null,
          };
          return { index, event: { type: "post", post } };
        },
        (error: unknown): Outcome => ({ index, event: skip, error: classifyError(error) }),
      ),
    );
  });

  let posted = 0;
  let lastError: ReturnType<typeof classifyError> | undefined;
  while (pending.size > 0) {
    const outcome = await Promise.race(pending.values());
    pending.delete(outcome.index);
    if (outcome.error?.aborted) return;
    if (outcome.error) lastError = outcome.error;
    if (outcome.event.type === "post") posted++;
    yield outcome.event;
  }
  if (posted === 0 && lastError) {
    yield { type: "error", code: lastError.code, message: lastError.message };
    return;
  }
  yield { type: "done" };
}
