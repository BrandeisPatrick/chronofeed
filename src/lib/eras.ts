/**
 * Timeline model: 12 era bands covering 3000 BCE to 2500 CE.
 *
 * Years are integers, negative for BCE, and there is no year 0 (1 BCE is
 * followed by 1 CE). The timeline bar is piecewise-linear: every band gets an
 * equal share of the track and years are spread linearly inside a band.
 */

export const MIN_YEAR = -3000;
export const MAX_YEAR = 2500;

export interface EraBand {
  /** Stable identifier, used for keys. */
  id: string;
  name: string;
  /** Compact label for the band row under the track. */
  short: string;
  /** First year of the band (inclusive). */
  start: number;
  /** Last year of the band; equal to the next band's start (shared edge). */
  end: number;
  /** The year a click on the band label jumps to. */
  signature: number;
  /** Fill colour: white text on it meets WCAG AA in both themes. */
  accent: string;
  /** Text/link colour for dark backgrounds (AA against the dark page colour). */
  accentInkDark: string;
}

export const ERAS: readonly EraBand[] = [
  { id: "ancient", name: "Ancient World", short: "Ancient", start: -3000, end: -800, signature: -1250, accent: "#8a5a12", accentInkDark: "#e0b35a" },
  { id: "classical", name: "Classical Antiquity", short: "Classical", start: -800, end: 500, signature: -44, accent: "#a8432a", accentInkDark: "#f29a80" },
  { id: "early-medieval", name: "Early Middle Ages", short: "Early Med.", start: 500, end: 1000, signature: 800, accent: "#2f6b4f", accentInkDark: "#7fd3a8" },
  { id: "late-medieval", name: "Late Middle Ages", short: "Late Med.", start: 1000, end: 1450, signature: 1347, accent: "#a12b3c", accentInkDark: "#f4919f" },
  { id: "renaissance", name: "Renaissance", short: "Renaiss.", start: 1450, end: 1650, signature: 1504, accent: "#2f4fb0", accentInkDark: "#9db2ff" },
  { id: "enlightenment", name: "Enlightenment", short: "Enlighten.", start: 1650, end: 1800, signature: 1789, accent: "#7a4b9c", accentInkDark: "#cda6ee" },
  { id: "industrial", name: "Industrial Age", short: "Industrial", start: 1800, end: 1900, signature: 1865, accent: "#6b4e3d", accentInkDark: "#d8b39b" },
  { id: "world-wars", name: "World Wars", short: "World Wars", start: 1900, end: 1945, signature: 1929, accent: "#5b6620", accentInkDark: "#c6d47a" },
  { id: "cold-war", name: "Cold War", short: "Cold War", start: 1945, end: 1991, signature: 1969, accent: "#3d5a80", accentInkDark: "#a3c0e6" },
  { id: "internet", name: "Internet Age", short: "Internet", start: 1991, end: 2030, signature: 2007, accent: "#0e7490", accentInkDark: "#6fd0e6" },
  { id: "near-future", name: "Near Future", short: "Near Future", start: 2030, end: 2100, signature: 2077, accent: "#a2378f", accentInkDark: "#f096dc" },
  { id: "far-future", name: "Far Future", short: "Far Future", start: 2100, end: 2500, signature: 2301, accent: "#4b4fc4", accentInkDark: "#aeb1ff" },
];

/** Converts a historical year (no year 0) to an astronomical one (1 BCE = 0). */
export function toAstronomical(year: number): number {
  return year < 0 ? year + 1 : year;
}

/** Converts an astronomical year back to a historical one (0 becomes 1 BCE). */
export function fromAstronomical(astro: number): number {
  return astro <= 0 ? astro - 1 : astro;
}

/** Clamps to the timeline range and snaps the non-existent year 0 to 1 CE. */
export function clampYear(year: number): number {
  const rounded = Math.round(year);
  const clamped = Math.min(MAX_YEAR, Math.max(MIN_YEAR, rounded));
  return clamped === 0 ? 1 : clamped;
}

/** Adds a number of years, skipping year 0, clamped to the timeline. */
export function addYears(year: number, delta: number): number {
  return clampYear(fromAstronomical(toAstronomical(year) + delta));
}

/** Index of the band containing `year`; band starts are inclusive. */
export function bandIndexForYear(year: number): number {
  const y = clampYear(year);
  for (let i = ERAS.length - 1; i >= 0; i--) {
    if (y >= ERAS[i].start) return i;
  }
  return 0;
}

export function bandForYear(year: number): EraBand {
  return ERAS[bandIndexForYear(year)];
}

/** Position on the track in [0, 1]. */
export function yearToPosition(year: number): number {
  const y = clampYear(year);
  const index = bandIndexForYear(y);
  const band = ERAS[index];
  const start = toAstronomical(band.start);
  const end = toAstronomical(band.end);
  const fraction = (toAstronomical(y) - start) / (end - start);
  return (index + fraction) / ERAS.length;
}

/** Inverse of {@link yearToPosition}; positions outside [0, 1] are clamped. */
export function positionToYear(position: number): number {
  const p = Math.min(1, Math.max(0, position)) * ERAS.length;
  const index = Math.min(ERAS.length - 1, Math.floor(p));
  const band = ERAS[index];
  const start = toAstronomical(band.start);
  const end = toAstronomical(band.end);
  const astro = Math.round(start + (p - index) * (end - start));
  return clampYear(fromAstronomical(astro));
}

/** "1250 BCE", "800 CE", or a plain "1347" from 1000 CE on. */
export function formatYear(year: number): string {
  if (year < 0) return `${-year} BCE`;
  if (year < 1000) return `${year} CE`;
  return String(year);
}

/** The numeral and its era suffix separately, for the large readout. */
export function yearParts(year: number): { numeral: string; suffix: "BCE" | "CE" } {
  return year < 0 ? { numeral: String(-year), suffix: "BCE" } : { numeral: String(year), suffix: "CE" };
}

/**
 * Parses what a user might type into the year readout: "1347", "-44",
 * "44 BCE", "44 bc", "800 CE", "800 AD", "AD 800". Returns null if the text is
 * not a year on the timeline.
 */
export function parseYear(input: string): number | null {
  const text = input.trim().toUpperCase().replace(/\./g, "").replace(/\s+/g, " ");
  const match = /^(AD |CE )?(-)?(\d{1,4})( ?(BCE|BC|CE|AD))?$/.exec(text);
  if (!match) return null;
  const [, prefix, minus, digits, , suffix] = match;
  const isBce = suffix === "BCE" || suffix === "BC";
  if (minus && (isBce || prefix || suffix)) return null;
  if (prefix && isBce) return null;
  const value = Number(digits);
  if (value === 0) return null;
  const year = minus || isBce ? -value : value;
  if (year < MIN_YEAR || year > MAX_YEAR) return null;
  return year;
}

/** Signature year of the previous / next band, for PageUp / PageDown. */
export function adjacentBandYear(year: number, direction: -1 | 1): number {
  const index = bandIndexForYear(year);
  const next = Math.min(ERAS.length - 1, Math.max(0, index + direction));
  return ERAS[next].signature;
}

/** Spoken value for the slider, e.g. "1347, Late Middle Ages". */
export function yearValueText(year: number): string {
  return `${formatYear(year)}, ${bandForYear(year).name}`;
}
