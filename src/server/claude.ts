import "server-only";

import Anthropic from "@anthropic-ai/sdk";
import type { BetaMessageStreamParams } from "@anthropic-ai/sdk/resources/beta/messages";
import {
  readModelConfig,
  shouldUseServerFallbacks,
  SERVER_FALLBACK_BETA,
  type ModelConfig,
} from "@/lib/models";
import type { ErrorCode } from "@/lib/types";

/**
 * The one place that talks to the Claude API. The key is read from
 * ANTHROPIC_API_KEY on the server and never leaves it.
 */

export class MissingApiKeyError extends Error {
  constructor() {
    super("ANTHROPIC_API_KEY is not set");
    this.name = "MissingApiKeyError";
  }
}

let client: Anthropic | null = null;

function getClient(): Anthropic {
  const apiKey = process.env.ANTHROPIC_API_KEY?.trim();
  if (!apiKey) throw new MissingApiKeyError();
  client ??= new Anthropic({ apiKey });
  return client;
}

export function modelConfig(): ModelConfig {
  return readModelConfig(process.env);
}

/** A chunk of streamed text, or the final stop reason. */
export type TextChunk =
  | { type: "text"; text: string }
  | { type: "stop"; reason: Anthropic.Beta.Messages.BetaStopReason | null };

export interface TextRequest {
  model: string;
  maxTokens: number;
  /** System prompt blocks; the first is marked for prompt caching. */
  system: string[];
  user: string;
}

/** Builds the exact request body sent to the Messages API. Exported for tests and docs. */
export function buildStreamParams(request: TextRequest, config: ModelConfig): BetaMessageStreamParams {
  const system: Anthropic.Beta.Messages.BetaTextBlockParam[] = request.system.map((text, i) =>
    i === 0 ? { type: "text", text, cache_control: { type: "ephemeral" } } : { type: "text", text },
  );
  return {
    model: request.model,
    max_tokens: request.maxTokens,
    system,
    messages: [{ role: "user", content: request.user }],
    // Thinking is adaptive by default on current models: no `thinking` field,
    // no sampling parameters, no prefill. Effort is the depth control.
    output_config: { effort: config.effort },
    ...(shouldUseServerFallbacks(request.model, config)
      ? { betas: [SERVER_FALLBACK_BETA], fallbacks: "default" as const }
      : {}),
  };
}

/**
 * Streams a single-turn request and yields text deltas, then the stop reason.
 * Aborting `signal` cancels the upstream request.
 */
export async function* streamText(request: TextRequest, signal: AbortSignal): AsyncGenerator<TextChunk> {
  const params = buildStreamParams(request, modelConfig());
  const stream = getClient().beta.messages.stream(params, { signal });
  for await (const event of stream) {
    if (event.type === "content_block_delta" && event.delta.type === "text_delta") {
      yield { type: "text", text: event.delta.text };
    }
  }
  const final = await stream.finalMessage();
  yield { type: "stop", reason: final.stop_reason };
}

export interface ClassifiedError {
  code: ErrorCode;
  message: string;
  /** True when the request was cancelled by the browser; nothing to report. */
  aborted: boolean;
}

/** Maps an SDK error to a user-facing code and message, most specific class first. */
export function classifyError(error: unknown): ClassifiedError {
  const result = (code: ErrorCode, message: string): ClassifiedError => ({ code, message, aborted: false });
  if (error instanceof MissingApiKeyError) {
    return result("auth", "No Anthropic API key is configured on the server.");
  }
  if (error instanceof Anthropic.APIUserAbortError) {
    return { code: "upstream", message: "Request cancelled.", aborted: true };
  }
  if (error instanceof Anthropic.AuthenticationError) {
    return result("auth", "The Anthropic API key was rejected.");
  }
  if (error instanceof Anthropic.PermissionDeniedError) {
    return result("auth", "This API key is not allowed to use the configured model.");
  }
  if (error instanceof Anthropic.NotFoundError) {
    return result("not_found", "The configured model was not found. Check CHRONOFEED_MODEL and CHRONOFEED_PERSONA_MODEL.");
  }
  if (error instanceof Anthropic.RateLimitError) {
    return result("rate_limit", "Rate limited by the Claude API. Wait a moment and try again.");
  }
  if (error instanceof Anthropic.OverloadedError) {
    return result("overloaded", "Claude is overloaded right now. Try again shortly.");
  }
  if (error instanceof Anthropic.APIConnectionError) {
    return result("network", "Could not reach the Claude API.");
  }
  if (error instanceof Anthropic.APIError) {
    return result("upstream", `The Claude API returned an error${error.status ? ` (${error.status})` : ""}.`);
  }
  if (error instanceof Error && error.name === "AbortError") {
    return { code: "upstream", message: "Request cancelled.", aborted: true };
  }
  return result("upstream", "Something went wrong while generating.");
}
