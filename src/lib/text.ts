import { POST_MAX_CHARS } from "./types";

/**
 * Cleans a persona agent's raw output into post text: trims, removes a
 * wrapping pair of quotes or a "Name:" / "@handle:" preamble, collapses runs
 * of blank lines and cuts to 280 characters on a word boundary.
 */
export function cleanPostText(raw: string, handle?: string): string {
  let text = raw.trim();
  if (handle) {
    const preamble = new RegExp(`^@?${handle.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\s*:\\s*`, "i");
    text = text.replace(preamble, "");
  }
  const quoted = /^(["“'])([\s\S]*)(["”'])$/.exec(text);
  if (quoted && !quoted[2].includes(quoted[1] === "“" ? "”" : quoted[1])) text = quoted[2].trim();
  text = text.replace(/\n{3,}/g, "\n\n");
  return truncate(text, POST_MAX_CHARS);
}

export function truncate(text: string, max: number): string {
  const chars = Array.from(text);
  if (chars.length <= max) return text;
  const cut = chars.slice(0, max - 1).join("");
  const space = cut.lastIndexOf(" ");
  return `${(space > max * 0.6 ? cut.slice(0, space) : cut).trimEnd()}…`;
}

/** "1.2K", "34K", "1.5M". */
export function compactNumber(n: number): string {
  if (n < 1000) return String(n);
  if (n < 10_000) return `${(n / 1000).toFixed(1).replace(/\.0$/, "")}K`;
  if (n < 1_000_000) return `${Math.round(n / 1000)}K`;
  return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, "")}M`;
}

/** "now", "42m", "5h", "3d" between two epoch-millisecond timestamps. */
export function relativeTime(then: number, now: number): string {
  const minutes = Math.max(0, Math.floor((now - then) / 60_000));
  if (minutes < 1) return "now";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h`;
  return `${Math.floor(hours / 24)}d`;
}
