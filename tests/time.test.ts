import { describe, expect, it } from "vitest";
import { defaultWeeklyCutoffUtc, isBeforeCutoff } from "../src/backend/time";

describe("weekly cutoff", () => {
  it("sets Friday 10:00 AM America/Chicago during daylight time", () => {
    expect(defaultWeeklyCutoffUtc(new Date("2026-09-08T12:00:00.000Z"))).toBe("2026-09-11T15:00:00.000Z");
  });

  it("locks picks at the cutoff instant", () => {
    const cutoff = "2026-09-11T15:00:00.000Z";
    expect(isBeforeCutoff(new Date("2026-09-11T14:59:59.999Z"), cutoff)).toBe(true);
    expect(isBeforeCutoff(new Date("2026-09-11T15:00:00.000Z"), cutoff)).toBe(false);
  });
});
