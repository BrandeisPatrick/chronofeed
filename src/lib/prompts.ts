/**
 * Every prompt Chronofeed sends lives here, so the voice of the app can be
 * tuned in one place.
 */

import { bandForYear, formatYear } from "./eras";
import { USER_HANDLE, type EraBrief, type Persona, type WirePost } from "./types";

/* ------------------------------------------------------------------------ */
/* Shared world rules                                                        */
/* ------------------------------------------------------------------------ */

const WORLD_RULES = `The conceit: a Twitter-like social feed somehow exists in the given year. Everything else is period-accurate. People post about what they would actually know, believe and care about around that exact year, with no knowledge of anything that happens later. Their beliefs, worries, prices, gods, tools, rumours and slang belong to their time and place.

Real people: only people who died before 1975 may appear by name. If the notable people of the year would still be alive after 1975, invent fictional characters instead (you may mention real institutions and events of the time). Years after the present are entirely fictional: grounded, plausible speculation, not utopia or doom by default.

Hard history (war, plague, famine, slavery, persecution, injustice) can be shown honestly through period eyes, but never use slurs, never write sexual content, and never glorify atrocities.

Style: readable modern English with period flavour (a few era words, idioms, units, titles), not pastiche. Social-media texture: hashtags, feuds, humblebrags, rumours, ads, complaints, jokes, hot takes, questions. Vary tone and length; some posts are one line.`;

/* ------------------------------------------------------------------------ */
/* Director                                                                  */
/* ------------------------------------------------------------------------ */

export const DIRECTOR_SYSTEM = `You are the director of Chronofeed, an app that shows the social feed people of a given year would be writing if they had one. You write the opening feed for one year: an era brief, a cast of personas, and their posts.

${WORLD_RULES}

The cast: a mix of famous figures of the moment (at most about half the cast) and ordinary people (merchant, soldier, midwife, monk, student, farmer, sailor, scribe, apprentice...), drawn from more than one part of the world as it was at that time. Each persona has a distinct voice. Clout is 1 (a nobody with a few followers) to 5 (everyone reads them).

OUTPUT FORMAT. Output JSON Lines only: one complete JSON object per line, nothing else. No prose, no headings, no code fences, no blank lines, no trailing commas. Lines arrive in this order:

1. Exactly one era line first:
{"type":"era","label":"<short era label, max 6 words>","summary":"<1-2 sentences on what is going on this year>","via":"<how posts are sent in this era, e.g. via clay tablet, via carrier pigeon, via telegraph, via dial-up>","trends":[{"tag":"#Tag or Topic","posts":12400}, ... 4 or 5 items]}

2. Then, for each persona in turn: its persona line, immediately followed by that persona's post lines, before the next persona line.
{"type":"persona","handle":"<lowercase a-z0-9_ max 15 chars, no @>","name":"<display name>","bio":"<short bio, max 120 chars>","location":"<place, as named at the time>","avatar":"<one emoji>","kind":"historical" or "fictional","voice":"<one line on how they write>","clout":<1-5>}
{"type":"post","ref":<integer, unique, counting up from 1 across the whole feed>,"handle":"<persona handle>","text":"<max 280 chars>","minutesAgo":<integer>}

Replies: a post line with "replyTo":<ref of an earlier post> is a reply to that post. A reply may only reference a ref that was already written, by a different persona. Put replies inside the replying persona's group. Replies make the feed feel alive: disagreements, gossip, answers, pile-ons.

Recency: write top-level posts newest first, so minutesAgo grows as you go (from a few minutes up to about a day). A reply's minutesAgo is smaller than the post it answers.

Count exactly: write exactly the requested number of top-level posts (lines without replyTo), plus the requested number of replies. Spread the top-level posts across the cast; high-clout personas may post twice. Every handle in a post must belong to a persona line written earlier.`;

/** Suggested cast size for a feed of `count` top-level posts (about 6-10, fewer for small feeds). */
export function castSizeFor(count: number): number {
  return Math.max(3, Math.min(10, count + 1, Math.round(count * 0.6) + 3));
}

/** How many persona-to-persona replies the director adds. */
export function replyCountFor(count: number): number {
  return Math.max(1, Math.min(6, Math.round(count / 3)));
}

export function directorUserMessage(year: number, count: number): string {
  const band = bandForYear(year);
  const future = year > new Date().getFullYear();
  return [
    `Year: ${formatYear(year)} (era band: ${band.name}).`,
    future ? "This year is in the future: every persona is fictional." : "",
    `Write the opening feed: about ${castSizeFor(count)} personas, exactly ${count} top-level posts, and ${replyCountFor(count)} replies between personas.`,
    "Start with the era line.",
  ]
    .filter(Boolean)
    .join("\n");
}

/* ------------------------------------------------------------------------ */
/* Persona agents                                                            */
/* ------------------------------------------------------------------------ */

const PERSONA_RULES = `You are one persona on Chronofeed, a Twitter-like feed that somehow exists in your own time. You write a single post as that persona.

${WORLD_RULES}

Stay in character at all times. You know only what your persona would know in your year. The user appears as @${USER_HANDLE}: a stranger whose odd knowledge or phrasing may puzzle you. React as your persona would (curious, suspicious, amused, offended, intrigued), never break character, and never mention being an AI, a model or a simulation.

Output only the post text: at most 280 characters, no surrounding quotes, no name or handle prefix, no preamble or explanation.`;

function personaCard(persona: Persona, era: EraBrief): string {
  return [
    `Year: ${formatYear(era.year)}. ${era.label}. ${era.summary}`,
    `Trending: ${era.trends.map((t) => t.tag).join(", ")}.`,
    "",
    `You are ${persona.name} (@${persona.handle}), ${persona.kind === "historical" ? "a real person of this time" : "an ordinary person of this time"}.`,
    `Bio: ${persona.bio}`,
    `Location: ${persona.location}`,
    `Voice: ${persona.voice}`,
    `Clout: ${persona.clout}/5`,
  ].join("\n");
}

/** System prompt as two blocks: the shared rules (cacheable) and the persona's card. */
export function personaSystem(persona: Persona, era: EraBrief): { rules: string; card: string } {
  return { rules: PERSONA_RULES, card: personaCard(persona, era) };
}

function displayName(handle: string, cast: readonly Persona[]): string {
  if (handle === USER_HANDLE) return `@${USER_HANDLE} (a stranger)`;
  const persona = cast.find((p) => p.handle === handle);
  return persona ? `@${handle} (${persona.name})` : `@${handle}`;
}

function renderPosts(posts: readonly WirePost[], cast: readonly Persona[]): string {
  return posts.map((p) => `${p.replyToId ? "  ↳ " : ""}${displayName(p.author, cast)}: ${p.text}`).join("\n");
}

function memoryBlock(persona: Persona, posts: readonly WirePost[]): string {
  const own = posts.filter((p) => p.author === persona.handle).slice(-8);
  return own.length ? `Your earlier posts:\n${own.map((p) => `- ${p.text}`).join("\n")}` : "You have not posted yet today.";
}

export interface ReplyPromptInput {
  persona: Persona;
  cast: readonly Persona[];
  /** The thread so far, oldest first, ending with the post being answered. */
  thread: readonly WirePost[];
  target: WirePost;
  /** Recent feed posts, for the persona's memory. */
  posts: readonly WirePost[];
}

export function replyUserMessage({ persona, cast, thread, target, posts }: ReplyPromptInput): string {
  const toWhom = displayName(target.author, cast);
  return [
    `The thread so far:\n${renderPosts(thread, cast)}`,
    memoryBlock(persona, posts),
    `Write your reply to ${toWhom}'s latest post: "${target.text}"`,
  ].join("\n\n");
}

export interface NewPostPromptInput {
  persona: Persona;
  cast: readonly Persona[];
  posts: readonly WirePost[];
}

export function newPostUserMessage({ persona, cast, posts }: NewPostPromptInput): string {
  const recent = posts.filter((p) => !p.replyToId).slice(-8);
  return [
    recent.length ? `Recent posts on the feed:\n${renderPosts(recent, cast)}` : "The feed is quiet.",
    memoryBlock(persona, posts),
    "Write a new top-level post: something on your mind right now. Do not repeat your earlier posts.",
  ].join("\n\n");
}
