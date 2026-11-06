/**
 * Domain types shared by the server and the browser. Validation lives in
 * `schemas.ts`; these are the shapes after validation.
 */

export const POST_MAX_CHARS = 280;
export const USER_HANDLE = "you";

export interface Trend {
  tag: string;
  posts: number;
}

export interface EraBrief {
  year: number;
  /** Short era label, e.g. "Black Death reaches Europe". */
  label: string;
  /** One or two sentences on what is going on. */
  summary: string;
  trends: Trend[];
  /** How posts are "sent" in this era, e.g. "via clay tablet". */
  via: string;
}

export type PersonaKind = "historical" | "fictional";

export interface Persona {
  handle: string;
  name: string;
  bio: string;
  location: string;
  /** A single emoji. */
  avatar: string;
  kind: PersonaKind;
  /** One-line note on how they write. */
  voice: string;
  /** Influence, 1 (nobody) to 5 (everyone reads them). */
  clout: number;
}

/** A post as it travels over the wire. */
export interface WirePost {
  id: string;
  /** Persona handle, or {@link USER_HANDLE} for the user. */
  author: string;
  text: string;
  minutesAgo: number;
  /** The post this one answers, if it is a reply. */
  replyToId: string | null;
  /** The top-level post of the thread, if it is a reply. */
  rootId: string | null;
}

export type ErrorCode =
  | "auth"
  | "rate_limit"
  | "overloaded"
  | "refusal"
  | "not_found"
  | "network"
  | "empty"
  | "upstream";

export type StreamEvent =
  | { type: "era"; era: EraBrief }
  | { type: "persona"; persona: Persona }
  | { type: "post"; post: WirePost }
  /** A persona has started writing a reply (or a new post when replyToId is null). */
  | { type: "typing"; handle: string; replyToId: string | null }
  /** A persona that was typing produced nothing (refused or failed). */
  | { type: "skip"; handle: string; replyToId: string | null }
  | { type: "error"; code: ErrorCode; message: string }
  | { type: "done" };
