import { describe, expect, it } from "vitest";
import { isScrapeDue, scrapeStatusFromPayload } from "../src/backend/scrapeSchedulerRules";
import type { Week } from "../src/backend/types";

const week: Week = {
  leagueId: "friends",
  seasonId: "2026",
  weekId: "1",
  label: "Week 1",
  scrapeAt: "2026-09-08T15:00:00.000Z",
  scrapeStatus: "pending",
  cutoffAt: "2026-09-11T15:00:00.000Z",
  status: "open",
  nflPickCountRequired: 3,
  ncaafPickCountRequired: 3
};

describe("scrape scheduler rules", () => {
  it("treats pending weeks at or past scrapeAt as due", () => {
    expect(isScrapeDue(week, new Date("2026-09-08T15:00:00.000Z"))).toBe(true);
    expect(isScrapeDue(week, new Date("2026-09-08T15:01:00.000Z"))).toBe(true);
  });

  it("does not run before scrapeAt", () => {
    expect(isScrapeDue(week, new Date("2026-09-08T14:59:59.999Z"))).toBe(false);
  });

  it("does not rerun completed weeks", () => {
    expect(isScrapeDue({ ...week, scrapeStatus: "completed" }, new Date("2026-09-08T16:00:00.000Z"))).toBe(false);
  });

  it("maps scraper payloads to weekly scrape status", () => {
    expect(scrapeStatusFromPayload({ games: [{ gameId: "a" }], errors: [] })).toBe("completed");
    expect(scrapeStatusFromPayload({ games: [{ gameId: "a" }], errors: ["NCAAF failed"] })).toBe("partial");
    expect(scrapeStatusFromPayload({ games: [], errors: ["blocked"] })).toBe("failed");
    expect(scrapeStatusFromPayload(undefined)).toBe("failed");
  });
});
