import { z } from "zod";
import { MAX_YEAR, MIN_YEAR } from "./eras";
import { POST_MAX_CHARS } from "./types";

/* ------------------------------------------------------------------------ */
/* Model output (director JSONL). Lenient: trim and truncate, reject only    */
/* what cannot be used.                                                      */
/* ------------------------------------------------------------------------ */

/** A required string from the model, trimmed and cut to `max` characters. */
const modelText = (max: number) =>
  z
    .string()
    .trim()
    .min(1)
    .transform((s) => s.slice(0, max));

/** Handles are lowercase [a-z0-9_], at most 20 characters, without the "@". */
export function normalizeHandle(raw: string): string {
  return raw
    .trim()
    .replace(/^@+/, "")
    .toLowerCase()
    .replace(/[^a-z0-9_]/g, "_")
    .replace(/_+/g, "_")
    .replace(/^_|_$/g, "")
    .slice(0, 20);
}

const modelHandle = z
  .string()
  .transform(normalizeHandle)
  .refine((h) => h.length > 0 && h !== "you", "invalid handle");

const integerish = z.coerce.number().refine(Number.isFinite).transform(Math.round);

export const directorEraLine = z.object({
  type: z.literal("era"),
  label: modelText(80),
  summary: modelText(400),
  via: modelText(40).transform((v) => (/^via\b/i.test(v) ? v : `via ${v}`).slice(0, 40)),
  trends: z
    .array(
      z.object({
        tag: modelText(40),
        posts: integerish.transform((n) => Math.max(0, n)),
      }),
    )
    .min(1)
    .transform((t) => t.slice(0, 6)),
});

/** An optional string from the model: missing or malformed becomes `fallback`. */
const optionalModelText = (max: number, fallback = "") =>
  z
    .string()
    .trim()
    .transform((s) => s.slice(0, max) || fallback)
    .catch(fallback);

// Only handle and name are essential. A persona line with a missing bio, an
// unexpected `kind` or no avatar is still usable, and dropping it would also
// drop every post that persona wrote.
export const directorPersonaLine = z.object({
  type: z.literal("persona"),
  handle: modelHandle,
  name: modelText(50),
  bio: optionalModelText(160),
  location: optionalModelText(60),
  avatar: optionalModelText(16, "👤"),
  kind: z
    .string()
    .transform((k): "historical" | "fictional" => (k.trim().toLowerCase() === "historical" ? "historical" : "fictional"))
    .catch("fictional"),
  voice: optionalModelText(160),
  clout: integerish.transform((n) => Math.min(5, Math.max(1, n))).catch(2),
});

export const directorPostLine = z.object({
  type: z.literal("post"),
  ref: integerish,
  handle: modelHandle,
  text: modelText(POST_MAX_CHARS),
  minutesAgo: integerish.transform((n) => Math.min(10080, Math.max(0, n))),
  replyTo: integerish.nullish(),
});

export const directorLine = z.discriminatedUnion("type", [directorEraLine, directorPersonaLine, directorPostLine]);
export type DirectorLine = z.infer<typeof directorLine>;

/* ------------------------------------------------------------------------ */
/* Request bodies. Strict: every string and array is capped, since the app   */
/* may be deployed and these feed straight into paid model calls.            */
/* ------------------------------------------------------------------------ */

const year = z
  .number()
  .int()
  .min(MIN_YEAR)
  .max(MAX_YEAR)
  .refine((y) => y !== 0, "there is no year 0");

const handle = z.string().regex(/^[a-z0-9_]{1,20}$/);
const id = z.string().min(1).max(64);

export const eraBriefSchema = z.object({
  year,
  label: z.string().max(80),
  summary: z.string().max(400),
  via: z.string().max(40),
  trends: z.array(z.object({ tag: z.string().max(40), posts: z.number().int().min(0) })).max(6),
});

export const personaSchema = z.object({
  handle,
  name: z.string().min(1).max(50),
  bio: z.string().max(160),
  location: z.string().max(60),
  avatar: z.string().max(16),
  kind: z.enum(["historical", "fictional"]),
  voice: z.string().max(160),
  clout: z.number().int().min(1).max(5),
});

export const wirePostSchema = z.object({
  id,
  author: handle,
  text: z.string().min(1).max(POST_MAX_CHARS + 20),
  minutesAgo: z.number().int().min(0).max(1_000_000),
  replyToId: id.nullable(),
  rootId: id.nullable(),
});

export const MAX_CAST = 12;
export const MAX_CONTEXT_POSTS = 60;
export const MIN_COUNT = 3;
export const MAX_COUNT = 20;
export const DEFAULT_COUNT = 8;

export const feedRequestSchema = z.object({
  year,
  count: z.number().int().min(MIN_COUNT).max(MAX_COUNT).default(DEFAULT_COUNT),
});

const contextSchema = {
  era: eraBriefSchema,
  cast: z.array(personaSchema).min(1).max(MAX_CAST),
  posts: z.array(wirePostSchema).max(MAX_CONTEXT_POSTS),
};

export const respondRequestSchema = z.object({
  ...contextSchema,
  userPost: wirePostSchema.extend({
    author: z.literal("you"),
    text: z.string().trim().min(1).max(POST_MAX_CHARS),
  }),
});

export const tickRequestSchema = z.object(contextSchema);

export type FeedRequest = z.infer<typeof feedRequestSchema>;
export type RespondRequest = z.infer<typeof respondRequestSchema>;
export type TickRequest = z.infer<typeof tickRequestSchema>;
