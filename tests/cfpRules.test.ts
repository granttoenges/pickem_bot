import { describe, expect, it } from "vitest";
import { buildCfpAssignment, findAssignableCfpTeam, mergeCfpTeamOdds, parseUploadedCfpOdds, parseUploadedCfpOddsText } from "../src/backend/cfpRules";
import type { CfpAssignment, CfpTeamOdds } from "../src/backend/types";

function team(teamKey: string, americanOdds: number, available = true): CfpTeamOdds {
  return {
    seasonId: "2026",
    teamKey,
    teamName: teamKey.toUpperCase(),
    americanOdds,
    available,
    capturedAt: "2026-08-01T12:00:00.000Z",
    lastSeenAt: "2026-08-01T12:00:00.000Z",
    sourceUrl: "https://example.test"
  };
}

function assignment(teamKey: string, userId = "user-1"): CfpAssignment {
  return {
    leagueId: "friends",
    seasonId: "2026",
    teamKey,
    teamName: teamKey.toUpperCase(),
    userId,
    pickedOdds: 200,
    assignedAt: "2026-08-01T12:00:00.000Z",
    assignedBy: "admin"
  };
}

describe("CFP assignment and odds rules", () => {
  it("allows multiple different teams for the same member and blocks a duplicate team", () => {
    const existing = [assignment("texas")];
    expect(findAssignableCfpTeam(existing, [team("texas", 150), team("georgia", -110)], "georgia").status).toBe("available");
    expect(findAssignableCfpTeam(existing, [team("texas", 150)], "texas").status).toBe("assigned");
  });

  it("rejects unavailable teams", () => {
    expect(findAssignableCfpTeam([], [team("texas", 150, false)], "texas").status).toBe("unavailable");
  });

  it("copies immutable picked odds into a new assignment", () => {
    const created = buildCfpAssignment({
      leagueId: "friends",
      seasonId: "2026",
      userId: "user-1",
      assignedBy: "admin",
      assignedAt: "2026-08-02T12:00:00.000Z",
      odds: team("texas", 275)
    });
    expect(created).toMatchObject({ teamKey: "texas", pickedOdds: 275, userId: "user-1" });
  });

  it("updates current prices while preserving missing teams as unavailable", () => {
    const merged = mergeCfpTeamOdds([team("texas", 275), team("georgia", -110)], [team("texas", 190)]);
    expect(merged.find((item) => item.teamKey === "texas")).toMatchObject({ americanOdds: 190, available: true });
    expect(merged.find((item) => item.teamKey === "georgia")).toMatchObject({ americanOdds: -110, available: false });
  });

  it("refuses an empty replacement so stale data cannot be cleared", () => {
    expect(() => mergeCfpTeamOdds([team("texas", 275)], [])).toThrow(/at least one team price/i);
  });

  it("parses an uploaded team-to-American-odds JSON object", () => {
    const uploaded = parseUploadedCfpOdds({
      "Notre Dame": -800,
      "Ohio State": "-360",
      "Texas A&M": "+154",
      Pittsburgh: 850
    }, "2026", "2026-08-03T12:00:00.000Z");

    expect(uploaded).toHaveLength(4);
    expect(uploaded).toEqual(expect.arrayContaining([
      expect.objectContaining({ teamKey: "notre-dame", americanOdds: -800, sourceUrl: "admin-json-upload" }),
      expect.objectContaining({ teamKey: "texas-a-and-m", americanOdds: 154 })
    ]));
  });

  it("accepts Unicode minus signs in uploaded odds", () => {
    expect(parseUploadedCfpOdds({ Georgia: "−240" }, "2026", "2026-08-03T12:00:00.000Z")[0].americanOdds).toBe(-240);
  });

  it("parses alternating pasted team and odds lines while ignoring blanks", () => {
    const uploaded = parseUploadedCfpOddsText(`
Notre Dame
−800

Ohio State
−360

Texas A&M
+154
`, "2026", "2026-08-03T12:00:00.000Z");

    expect(uploaded).toEqual(expect.arrayContaining([
      expect.objectContaining({ teamName: "Notre Dame", americanOdds: -800 }),
      expect.objectContaining({ teamName: "Ohio State", americanOdds: -360 }),
      expect.objectContaining({ teamName: "Texas A&M", americanOdds: 154 })
    ]));
  });

  it("rejects incomplete and duplicate pasted team/odds pairs", () => {
    expect(() => parseUploadedCfpOddsText("Notre Dame\n−800\nOhio State", "2026", "2026-08-03T12:00:00.000Z")).toThrow(/followed by an American odds line/i);
    expect(() => parseUploadedCfpOddsText("Texas A&M\n+154\nTexas A and M\n+160", "2026", "2026-08-03T12:00:00.000Z")).toThrow(/duplicate CFP team/i);
  });

  it("rejects empty, malformed, and duplicate-normalized uploads before replacement", () => {
    expect(() => parseUploadedCfpOdds({}, "2026", "2026-08-03T12:00:00.000Z")).toThrow(/at least one team/i);
    expect(() => parseUploadedCfpOdds({ Georgia: "favorite" }, "2026", "2026-08-03T12:00:00.000Z")).toThrow(/invalid American odds/i);
    expect(() => parseUploadedCfpOdds({ "Texas A&M": 154, "Texas A and M": 160 }, "2026", "2026-08-03T12:00:00.000Z")).toThrow(/duplicate CFP team/i);
  });
});
