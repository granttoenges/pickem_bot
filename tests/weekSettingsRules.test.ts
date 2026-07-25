import { describe, expect, it } from "vitest";
import { applyWeekSettings } from "../src/backend/weekSettingsRules";
import type { Week } from "../src/backend/types";

const week: Week = {
  leagueId: "friends",
  seasonId: "2026",
  weekId: "1",
  label: "Week 1",
  scrapeAt: "2026-09-08T15:00:00.000Z",
  scrapeStatus: "completed",
  scrapeCompletedAt: "2026-09-08T15:01:00.000Z",
  cutoffAt: "2026-09-11T15:00:00.000Z",
  status: "open",
  nflPickCountRequired: 3,
  ncaafPickCountRequired: 3
};

describe("applyWeekSettings", () => {
  it("saves quota, scrape time, and cutoff time", () => {
    const updated = applyWeekSettings(week, {
      nflPickCountRequired: 3,
      ncaafPickCountRequired: 1,
      scrapeAt: "2026-09-09T15:00:00.000Z",
      cutoffAt: "2026-09-12T15:00:00.000Z"
    });
    expect(updated.ncaafPickCountRequired).toBe(1);
    expect(updated.scrapeAt).toBe("2026-09-09T15:00:00.000Z");
    expect(updated.cutoffAt).toBe("2026-09-12T15:00:00.000Z");
  });

  it("resets scrape status when capture time changes", () => {
    const updated = applyWeekSettings(week, {
      nflPickCountRequired: 3,
      ncaafPickCountRequired: 3,
      scrapeAt: "2026-09-09T15:00:00.000Z",
      cutoffAt: week.cutoffAt
    });
    expect(updated.scrapeStatus).toBe("pending");
    expect(updated.scrapeCompletedAt).toBeUndefined();
  });

  it("keeps completed status when capture time does not change", () => {
    const updated = applyWeekSettings(week, {
      nflPickCountRequired: 3,
      ncaafPickCountRequired: 3,
      scrapeAt: week.scrapeAt,
      cutoffAt: week.cutoffAt
    });
    expect(updated.scrapeStatus).toBe("completed");
    expect(updated.scrapeCompletedAt).toBe("2026-09-08T15:01:00.000Z");
  });
});
