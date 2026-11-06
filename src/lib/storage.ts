/** localStorage persistence for visited feeds and settings. Browser only; every access is guarded. */

import { restoreFeeds, serializableFeeds, type Feed } from "./feed-state";
import { DEFAULT_COUNT, MAX_COUNT, MIN_COUNT } from "./schemas";

const FEEDS_KEY = "chronofeed:feeds:v1";
const SETTINGS_KEY = "chronofeed:settings:v1";

export interface Settings {
  count: number;
  live: boolean;
}

function read(key: string): unknown {
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function write(key: string, value: unknown): void {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Storage full or blocked: the in-memory cache still works.
  }
}

export function loadFeeds(): Feed[] {
  return restoreFeeds(read(FEEDS_KEY));
}

export function saveFeeds(feeds: Record<number, Feed>): void {
  write(FEEDS_KEY, serializableFeeds(feeds));
}

export function loadSettings(): Settings {
  const raw = read(SETTINGS_KEY) as Partial<Settings> | null;
  const count = Number.isInteger(raw?.count) ? Math.min(MAX_COUNT, Math.max(MIN_COUNT, raw!.count!)) : DEFAULT_COUNT;
  return { count, live: typeof raw?.live === "boolean" ? raw.live : true };
}

export function saveSettings(settings: Settings): void {
  write(SETTINGS_KEY, settings);
}
