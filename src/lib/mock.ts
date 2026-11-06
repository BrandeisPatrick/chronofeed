/**
 * Deterministic template content for CHRONOFEED_MOCK=1. The mock director
 * emits the same JSONL a real model would, so it runs through the exact same
 * parsing and validation pipeline.
 */

import { bandForYear, formatYear } from "./eras";
import { castSizeFor, replyCountFor } from "./prompts";
import { seededRng, type Rng } from "./selection";
import type { EraBrief, Persona, WirePost } from "./types";

const VIAS: Record<string, string> = {
  ancient: "via clay tablet",
  classical: "via wax tablet",
  "early-medieval": "via illuminated vellum",
  "late-medieval": "via town crier",
  renaissance: "via printing press",
  enlightenment: "via coffeehouse broadsheet",
  industrial: "via telegraph",
  "world-wars": "via wireless",
  "cold-war": "via teletype",
  internet: "via dial-up",
  "near-future": "via neural relay",
  "far-future": "via quantum mesh",
};

const ARCHETYPES: ReadonlyArray<Omit<Persona, "handle" | "location"> & { slug: string }> = [
  { slug: "merchant", name: "Hadi the Merchant", bio: "Buys low, sells high, complains always.", avatar: "🧺", kind: "fictional", voice: "Haggling, price-obsessed, cheerful.", clout: 3 },
  { slug: "midwife", name: "Old Marta", bio: "Midwife. Has seen it all twice.", avatar: "🌿", kind: "fictional", voice: "Dry, practical, unimpressed.", clout: 2 },
  { slug: "soldier", name: "Corporal Ansel", bio: "Marching somewhere. Feet hurt.", avatar: "🛡️", kind: "fictional", voice: "Grumbling, loyal, gallows humour.", clout: 2 },
  { slug: "scholar", name: "Master Ibn Tariq", bio: "Reads the stars and the ledgers.", avatar: "📜", kind: "fictional", voice: "Precise, curious, footnotes everything.", clout: 4 },
  { slug: "monk", name: "Brother Wen", bio: "Copies texts. Brews things.", avatar: "🕯️", kind: "fictional", voice: "Gentle, wry, quotes scripture.", clout: 1 },
  { slug: "student", name: "Lia the Student", bio: "Tired. Broke. Learning.", avatar: "🎒", kind: "fictional", voice: "Excitable, sarcastic, many questions.", clout: 2 },
  { slug: "ruler", name: "The Grand Vizier", bio: "Official account of the court.", avatar: "👑", kind: "fictional", voice: "Pompous, formal, humblebrags.", clout: 5 },
  { slug: "sailor", name: "Tomas Saltbeard", bio: "Just docked. Has rumours.", avatar: "⚓", kind: "fictional", voice: "Loud, superstitious, spins yarns.", clout: 3 },
  { slug: "farmer", name: "Gudrun of the Fields", bio: "Weather watcher. Turnip enthusiast.", avatar: "🌾", kind: "fictional", voice: "Blunt, earthy, suspicious of cities.", clout: 1 },
  { slug: "artisan", name: "Kofi the Smith", bio: "Hammer for hire. Opinions free.", avatar: "🔨", kind: "fictional", voice: "Proud, punchy, advertises constantly.", clout: 3 },
];

const LOCATIONS = ["the harbour", "the old market", "the capital", "a border fort", "the river valley", "the hill monastery", "the university quarter", "the trade road", "a fishing village", "the palace district"];

const POST_TEMPLATES: readonly string[] = [
  "Prices at the market in {year} are an outrage. Three coins for a cabbage?! #{tag}",
  "Unpopular opinion: {year} is the best year to be alive. Fight me in the replies.",
  "Heard a rumour from a traveller today. Not saying it's true, but... #{tag}",
  "Humbled and honoured to announce I have been invited to the feast. Not bragging. Just grateful. #blessed",
  "Does anyone else think the weather this year is a sign? Asking for my whole village.",
  "AD: Finest wares in all of {era}. Ask for me by name. Mention this post for a discount.",
  "Long day. Feet hurt. Someone tell me {year} gets better from here.",
  "Hot take: the old ways were fine and nobody asked for this new nonsense. #{tag}",
  "Just learned something remarkable and I need everyone to know about it immediately.",
  "Day three of waiting for news from the capital. Silence. Suspicious silence.",
  "Who keeps leaving goats outside my door? This is the third time. I know it's one of you.",
  "Reminder that {era} did not build itself. Respect your local craftspeople.",
];

const REPLY_TEMPLATES: readonly string[] = [
  "Absolutely not. You clearly have not been to the market lately.",
  "This. A thousand times this.",
  "Source? My cousin says the opposite.",
  "Bold words for someone who still owes me for the bread.",
  "Ha! Said the same thing at supper last night.",
  "Respectfully: no.",
];

function pick<T>(items: readonly T[], rng: Rng): T {
  return items[Math.floor(rng() * items.length)];
}

function fill(template: string, year: number, tag: string): string {
  return template
    .replaceAll("{year}", formatYear(year))
    .replaceAll("{era}", bandForYear(year).name)
    .replaceAll("{tag}", tag);
}

function trendTags(year: number): string[] {
  const y = formatYear(year).replace(/\s/g, "");
  return [`Year${y}`, "MarketPrices", "RumourMill", "WeatherWatch", "CourtGossip"];
}

/**
 * The mock director's JSONL output for a year, line by line. Starts with a
 * code fence, which the real pipeline must ignore, to keep it honest.
 */
export function mockDirectorLines(year: number, count: number): string[] {
  const rng = seededRng(Math.abs(year) * 31 + count);
  const band = bandForYear(year);
  const tags = trendTags(year);
  const lines: string[] = ["```jsonl"];
  lines.push(
    JSON.stringify({
      type: "era",
      label: `${band.name}, mock edition`,
      summary: `It is ${formatYear(year)} and this feed is mock content: no model was called. Run without CHRONOFEED_MOCK to hear from the real agents.`,
      via: VIAS[band.id] ?? "via messenger",
      trends: tags.map((tag, i) => ({ tag: `#${tag}`, posts: Math.round((5 - i) * 4800 + rng() * 900) })),
    }),
  );

  const castSize = Math.min(castSizeFor(count), ARCHETYPES.length);
  const cast = ARCHETYPES.slice(0, castSize);
  // Distribute top-level posts round-robin, newest first, and a few replies.
  const perPersona = cast.map(() => [] as string[]);
  let ref = 0;
  let minutes = 2;
  for (let i = 0; i < count; i++) {
    const owner = i % cast.length;
    ref++;
    minutes += 7 + Math.floor(rng() * 50);
    const text = fill(pick(POST_TEMPLATES, rng), year, pick(tags, rng));
    perPersona[owner].push(JSON.stringify({ type: "post", ref, handle: cast[owner].slug, text, minutesAgo: minutes }));
  }

  const out: string[] = [];
  const refsSoFar: { ref: number; owner: number; minutesAgo: number }[] = [];
  const repliesWanted = replyCountFor(count);
  let replies = 0;
  cast.forEach((persona, owner) => {
    out.push(
      JSON.stringify({ type: "persona", handle: persona.slug, name: persona.name, bio: persona.bio, location: LOCATIONS[owner % LOCATIONS.length], avatar: persona.avatar, kind: persona.kind, voice: persona.voice, clout: persona.clout }),
    );
    for (const line of perPersona[owner]) {
      out.push(line);
      const parsed = JSON.parse(line) as { ref: number; minutesAgo: number };
      refsSoFar.push({ ref: parsed.ref, owner, minutesAgo: parsed.minutesAgo });
    }
    const target = refsSoFar.find((r) => r.owner !== owner);
    if (target && replies < repliesWanted && owner > 0) {
      ref++;
      replies++;
      out.push(JSON.stringify({ type: "post", ref, handle: persona.slug, text: pick(REPLY_TEMPLATES, rng), minutesAgo: Math.max(0, target.minutesAgo - 3), replyTo: target.ref }));
      refsSoFar.splice(refsSoFar.indexOf(target), 1);
    }
  });
  return lines.concat(out, ["```"]);
}

/** A mock persona post: a reply to `target`, or a new top-level post. */
export function mockPersonaText(persona: Persona, era: EraBrief, target: WirePost | null, seed: string): string {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const rng = seededRng(h);
  const year = formatYear(era.year);
  if (!target) {
    return `${fill(pick(POST_TEMPLATES, rng), era.year, era.trends[0]?.tag.replace(/^#/, "") ?? "News")} (mock post from ${persona.name})`;
  }
  const openers = target.author === "you"
    ? [`Strange words, @you. Nobody in ${year} talks like that.`, `@you, where are you from? Your phrasing is most peculiar.`, `Curious, stranger. Tell me more over a drink, @you.`]
    : [`@${target.author} ${pick(REPLY_TEMPLATES, rng)}`];
  return `${pick(openers, rng)} (mock reply from ${persona.name})`;
}
