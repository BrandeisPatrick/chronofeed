import { directorLine, type DirectorLine } from "./schemas";
import type { EraBrief, Persona, StreamEvent, WirePost } from "./types";

/**
 * Parses one line of the director's JSONL output. Returns null for blank
 * lines, code fences, stray prose and anything that fails validation.
 */
export function parseDirectorLine(raw: string): DirectorLine | null {
  let line = raw.trim();
  if (!line || line.startsWith("```")) return null;
  // Tolerate list markers or a trailing comma the model may add.
  line = line.replace(/^[-*]\s+/, "").replace(/,$/, "");
  if (!line.startsWith("{")) return null;
  let json: unknown;
  try {
    json = JSON.parse(line);
  } catch {
    return null;
  }
  const parsed = directorLine.safeParse(json);
  return parsed.success ? parsed.data : null;
}

export interface DirectorAssemblerOptions {
  year: number;
  /** Exact number of top-level posts wanted; extra top-level posts are dropped. */
  count: number;
  /** Prefix for generated post ids (unique per request). */
  idPrefix: string;
  maxCast?: number;
}

/**
 * Turns validated director lines into stream events: enforces the requested
 * year and post count, drops posts by unknown personas, resolves the
 * director's short reply references into ids and thread roots.
 */
export class DirectorAssembler {
  private era: EraBrief | null = null;
  private readonly cast = new Map<string, Persona>();
  /** Director ref -> assigned post. */
  private readonly refs = new Map<number, WirePost>();
  private topLevel = 0;
  private replies = 0;

  constructor(private readonly options: DirectorAssemblerOptions) {}

  get postCount(): number {
    return this.topLevel + this.replies;
  }

  get topLevelCount(): number {
    return this.topLevel;
  }

  get hasEra(): boolean {
    return this.era !== null;
  }

  /** Feeds one raw line; returns the events it produced (often none). */
  accept(raw: string): StreamEvent[] {
    const line = parseDirectorLine(raw);
    if (!line) return [];
    switch (line.type) {
      case "era": {
        if (this.era) return [];
        const { label, summary, via, trends } = line;
        this.era = { year: this.options.year, label, summary, via, trends };
        return [{ type: "era", era: this.era }];
      }
      case "persona": {
        if (this.cast.has(line.handle) || this.cast.size >= (this.options.maxCast ?? 12)) return [];
        const { handle, name, bio, location, avatar, kind, voice, clout } = line;
        const persona: Persona = { handle, name, bio, location, avatar, kind, voice, clout };
        this.cast.set(handle, persona);
        return [{ type: "persona", persona }];
      }
      case "post":
        return this.acceptPost(line);
    }
  }

  private acceptPost(line: Extract<DirectorLine, { type: "post" }>): StreamEvent[] {
    if (!this.cast.has(line.handle) || this.refs.has(line.ref)) return [];
    let replyToId: string | null = null;
    let rootId: string | null = null;
    if (line.replyTo != null) {
      const parent = this.refs.get(line.replyTo);
      if (!parent) return [];
      replyToId = parent.id;
      rootId = parent.rootId ?? parent.id;
    } else if (this.topLevel >= this.options.count) {
      return [];
    }
    const post: WirePost = {
      id: `${this.options.idPrefix}-${line.ref}`,
      author: line.handle,
      text: line.text,
      minutesAgo: line.minutesAgo,
      replyToId,
      rootId,
    };
    this.refs.set(line.ref, post);
    if (replyToId) this.replies++;
    else this.topLevel++;
    return [{ type: "post", post }];
  }
}
