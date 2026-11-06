import { USER_HANDLE, type Persona, type WirePost } from "./types";

/** A random source returning floats in [0, 1); injectable for tests. */
export type Rng = () => number;

/** Small seeded PRNG (mulberry32) for deterministic tests and mock content. */
export function seededRng(seed: number): Rng {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Picks up to `n` distinct personas, weighted by clout (higher clout, likelier). */
export function weightedSample(cast: readonly Persona[], n: number, rng: Rng): Persona[] {
  const pool = [...cast];
  const picked: Persona[] = [];
  while (picked.length < n && pool.length > 0) {
    const total = pool.reduce((sum, p) => sum + p.clout, 0);
    let roll = rng() * total;
    let index = pool.length - 1;
    for (let i = 0; i < pool.length; i++) {
      roll -= pool[i].clout;
      if (roll < 0) {
        index = i;
        break;
      }
    }
    picked.push(pool[index]);
    pool.splice(index, 1);
  }
  return picked;
}

/** 0 extra voices 40% of the time, 1 voice 40%, 2 voices 20%. */
function extraVoices(rng: Rng): number {
  const roll = rng();
  return roll < 0.4 ? 0 : roll < 0.8 ? 1 : 2;
}

/**
 * Who answers a comment by the user.
 *
 * - Replying to a persona's post: that author always answers, plus 0-2 others.
 * - A top-level post by the user (or a reply to the user's own post): 2-3 personas.
 */
export function pickResponders(cast: readonly Persona[], targetAuthor: string | null, rng: Rng): Persona[] {
  const author = targetAuthor && targetAuthor !== USER_HANDLE ? cast.find((p) => p.handle === targetAuthor) : undefined;
  if (author) {
    const others = cast.filter((p) => p.handle !== author.handle);
    return [author, ...weightedSample(others, extraVoices(rng), rng)];
  }
  const n = rng() < 0.5 ? 2 : 3;
  return weightedSample(cast, n, rng);
}

export type TickAction =
  | { kind: "post"; persona: Persona }
  | { kind: "reply"; persona: Persona; target: WirePost };

/** How many of the most recent posts are candidates for a background reply. */
const REPLY_WINDOW = 12;
const REPLY_CHANCE = 0.3;

/**
 * Background activity: 1-2 distinct personas, each mostly writing a new
 * top-level post and sometimes replying to another persona's recent post.
 * `posts` is ordered oldest first.
 */
export function pickTickActions(cast: readonly Persona[], posts: readonly WirePost[], rng: Rng): TickAction[] {
  const n = rng() < 0.6 ? 1 : 2;
  const recent = posts.slice(-REPLY_WINDOW);
  return weightedSample(cast, n, rng).map((persona): TickAction => {
    const targets = recent.filter((p) => p.author !== persona.handle && p.author !== USER_HANDLE);
    if (targets.length > 0 && rng() < REPLY_CHANCE) {
      return { kind: "reply", persona, target: targets[Math.floor(rng() * targets.length)] };
    }
    return { kind: "post", persona };
  });
}
