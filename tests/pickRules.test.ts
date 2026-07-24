import { describe, expect, it } from "vitest";
import { pickSummary, validateQuota } from "../src/backend/pickRules";
import type { PlayerPick, Week } from "../src/backend/types";

const week: Week = {
  leagueId: "friends",
  seasonId: "2026",
  weekId: "1",
  label: "Week 1",
  cutoffAt: "2026-09-11T15:00:00.000Z",
  status: "open",
  nflPickCountRequired: 3,
  ncaafPickCountRequired: 3
};

function pick(optionId: string, sportLeague: "NFL" | "NCAAF"): PlayerPick {
  return {
    leagueId: "friends",
    seasonId: "2026",
    weekId: "1",
    optionId,
    gameId: `game-${optionId}`,
    userId: "user-1",
    claimedAt: "2026-09-10T15:00:00.000Z",
    sportLeague,
    team: "Chicago",
    market: "spread",
    side: "home",
    lineValue: 1.5,
    submittedAt: "2026-09-10T15:00:00.000Z",
    result: "pending"
  };
}

describe("pick rules", () => {
  it("requires exact NFL and NCAAF quotas for completion", () => {
    expect(pickSummary([pick("a", "NFL"), pick("b", "NFL"), pick("c", "NCAAF")], week).complete).toBe(false);
    expect(pickSummary([
      pick("a", "NFL"),
      pick("b", "NFL"),
      pick("c", "NFL"),
      pick("d", "NCAAF"),
      pick("e", "NCAAF"),
      pick("f", "NCAAF")
    ], week).complete).toBe(true);
  });

  it("blocks picks beyond the sport quota", () => {
    expect(() => validateQuota(week, "NFL", [pick("a", "NFL"), pick("b", "NFL"), pick("c", "NFL")], undefined, "d")).toThrow("NFL pick quota");
  });

  it("allows replacing an existing pick when a card is full", () => {
    expect(() => validateQuota(week, "NFL", [pick("a", "NFL"), pick("b", "NFL"), pick("c", "NFL")], "a", "d")).not.toThrow();
  });
});
