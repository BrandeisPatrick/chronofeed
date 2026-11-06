/**
 * Model configuration read from the environment. Pure (no SDK import) so it
 * can be unit-tested; the server-only client module builds requests from it.
 */

export const DEFAULT_MODEL = "claude-opus-5-5";
export const DEFAULT_EFFORT = "low";

export type Effort = "low" | "medium" | "high" | "xhigh" | "max";
const EFFORTS: readonly Effort[] = ["low", "medium", "high", "xhigh", "max"];

/** Thinking counts against max_tokens, so these leave room for it. */
export const DIRECTOR_MAX_TOKENS = 16000;
export const PERSONA_MAX_TOKENS = 4000;

/** Beta header for the `fallbacks: "default"` scalar form. */
export const SERVER_FALLBACK_BETA = "server-side-fallback-2026-07-01";

/**
 * Models that take server-side refusal fallbacks on the Claude API. Claude
 * Haiku 5.5 has none (a `fallbacks` list is a 400 there), so it and any
 * unknown model get no fallbacks.
 */
const FALLBACK_MODELS = ["claude-opus-5-5", "claude-opus-5", "claude-fable-5-1", "claude-sonnet-5-5"];

/** True if `model` is one of the fallback-capable ids, optionally with a date suffix. */
export function supportsServerFallbacks(model: string): boolean {
  return FALLBACK_MODELS.some((id) => model === id || new RegExp(`^${id}-\\d{8}$`).test(model));
}

export interface ModelConfig {
  directorModel: string;
  personaModel: string;
  effort: Effort;
  /** False when CHRONOFEED_FALLBACKS=off. */
  fallbacksEnabled: boolean;
}

type Env = Record<string, string | undefined>;

export function readModelConfig(env: Env = process.env): ModelConfig {
  const directorModel = env.CHRONOFEED_MODEL?.trim() || DEFAULT_MODEL;
  const personaModel = env.CHRONOFEED_PERSONA_MODEL?.trim() || directorModel;
  const effortRaw = env.CHRONOFEED_EFFORT?.trim().toLowerCase();
  const effort = EFFORTS.find((e) => e === effortRaw) ?? DEFAULT_EFFORT;
  const fallbacksEnabled = !["off", "0", "false", "no"].includes(env.CHRONOFEED_FALLBACKS?.trim().toLowerCase() ?? "");
  return { directorModel, personaModel, effort, fallbacksEnabled };
}

/** Whether a request to `model` should carry `fallbacks: "default"` and its beta header. */
export function shouldUseServerFallbacks(model: string, config: ModelConfig): boolean {
  return config.fallbacksEnabled && supportsServerFallbacks(model);
}

export function isMockMode(env: Env = process.env): boolean {
  return ["1", "true", "yes", "on"].includes(env.CHRONOFEED_MOCK?.trim().toLowerCase() ?? "");
}
