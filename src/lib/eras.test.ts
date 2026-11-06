import { describe, expect, it } from "vitest";
import { contrastRatio } from "./color";
import {
  addYears,
  adjacentBandYear,
  bandForYear,
  clampYear,
  ERAS,
  formatYear,
  MAX_YEAR,
  MIN_YEAR,
  parseYear,
  positionToYear,
  yearToPosition,
  yearValueText,
} from "./eras";

describe("era bands", () => {
  it("has 12 contiguous bands covering the timeline", () => {
    expect(ERAS).toHaveLength(12);
    expect(ERAS[0].start).toBe(MIN_YEAR);
    expect(ERAS.at(-1)!.end).toBe(MAX_YEAR);
    for (let i = 1; i < ERAS.length; i++) expect(ERAS[i].start).toBe(ERAS[i - 1].end);
  });

  it("puts each signature year inside its own band", () => {
    for (const band of ERAS) expect(bandForYear(band.signature).id).toBe(band.id);
  });

  it("treats band starts as inclusive", () => {
    expect(bandForYear(-801).name).toBe("Ancient World");
    expect(bandForYear(-800).name).toBe("Classical Antiquity");
    expect(bandForYear(1449).name).toBe("Late Middle Ages");
    expect(bandForYear(1450).name).toBe("Renaissance");
    expect(bandForYear(2500).name).toBe("Far Future");
  });

  it("chooses accents with AA contrast for white text and on the dark page", () => {
    for (const band of ERAS) {
      expect(contrastRatio(band.accent, "#ffffff"), band.name).toBeGreaterThanOrEqual(4.5);
      expect(contrastRatio(band.accentInkDark, "#0f1114"), band.name).toBeGreaterThanOrEqual(4.5);
    }
  });
});

describe("year <-> position", () => {
  it("maps the ends of the timeline to 0 and 1", () => {
    expect(yearToPosition(MIN_YEAR)).toBe(0);
    expect(yearToPosition(MAX_YEAR)).toBe(1);
    expect(positionToYear(0)).toBe(MIN_YEAR);
    expect(positionToYear(1)).toBe(MAX_YEAR);
  });

  it("gives every band an equal width", () => {
    ERAS.forEach((band, i) => {
      expect(yearToPosition(band.start)).toBeCloseTo(i / 12, 10);
      expect(positionToYear(i / 12)).toBe(band.start);
    });
  });

  it("is linear inside a band", () => {
    // Late Middle Ages: 1000..1450, so 1225 is the midpoint of band 3.
    expect(yearToPosition(1225)).toBeCloseTo(3.5 / 12, 10);
  });

  it("round-trips every year on the timeline", () => {
    for (let y = MIN_YEAR; y <= MAX_YEAR; y++) {
      if (y === 0) continue;
      expect(positionToYear(yearToPosition(y))).toBe(y);
    }
  });

  it("clamps positions outside the track", () => {
    expect(positionToYear(-0.5)).toBe(MIN_YEAR);
    expect(positionToYear(1.5)).toBe(MAX_YEAR);
  });

  it("is monotonic", () => {
    let last = -Infinity;
    for (let y = MIN_YEAR; y <= MAX_YEAR; y += 7) {
      if (y === 0) continue;
      const p = yearToPosition(y);
      expect(p).toBeGreaterThan(last);
      last = p;
    }
  });
});

describe("year arithmetic", () => {
  it("skips year 0", () => {
    expect(addYears(-1, 1)).toBe(1);
    expect(addYears(1, -1)).toBe(-1);
    expect(addYears(-5, 10)).toBe(6);
    expect(clampYear(0)).toBe(1);
  });

  it("clamps to the timeline", () => {
    expect(addYears(MAX_YEAR, 10)).toBe(MAX_YEAR);
    expect(addYears(MIN_YEAR, -1)).toBe(MIN_YEAR);
  });

  it("steps to adjacent band signature years", () => {
    expect(adjacentBandYear(1347, 1)).toBe(1504);
    expect(adjacentBandYear(1347, -1)).toBe(800);
    expect(adjacentBandYear(MIN_YEAR, -1)).toBe(-1250);
    expect(adjacentBandYear(MAX_YEAR, 1)).toBe(2301);
  });
});

describe("formatting and parsing", () => {
  it("formats BCE, early CE and plain years", () => {
    expect(formatYear(-1250)).toBe("1250 BCE");
    expect(formatYear(800)).toBe("800 CE");
    expect(formatYear(999)).toBe("999 CE");
    expect(formatYear(1000)).toBe("1000");
    expect(formatYear(1347)).toBe("1347");
    expect(yearValueText(1347)).toBe("1347, Late Middle Ages");
  });

  it.each([
    ["1347", 1347],
    ["-44", -44],
    ["44 BCE", -44],
    ["44 bc", -44],
    ["44 B.C.", -44],
    ["800 CE", 800],
    ["800 AD", 800],
    ["AD 800", 800],
    [" 2077 ", 2077],
  ])("parses %j", (input, expected) => {
    expect(parseYear(input)).toBe(expected);
  });

  it.each(["", "0", "abc", "3001 BCE", "2501", "-44 BCE", "12345", "AD 44 BC"])("rejects %j", (input) => {
    expect(parseYear(input)).toBeNull();
  });

  it("round-trips formatYear through parseYear", () => {
    for (const y of [-3000, -1250, -44, -1, 1, 800, 999, 1000, 1347, 2500]) {
      expect(parseYear(formatYear(y))).toBe(y);
    }
  });
});
