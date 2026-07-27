import { describe, expect, it } from "vitest";
import { assertCanManuallyChangeProposalResponse, proposalSummary, responseResult, selfWithResponseForProposal, validateProposalQuota, pickSummary, validateQuota } from "../src/backend/pickRules";
import type { LineProposal, PlayerPick, Week } from "../src/backend/types";

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

function proposal(proposalId: string, sportLeague: "NFL" | "NCAAF"): LineProposal {
  return {
    leagueId: "friends",
    seasonId: "2026",
    weekId: "1",
    proposalId,
    optionId: proposalId,
    gameId: `game-${proposalId}`,
    proposerId: "user-1",
    proposerLabel: "user@example.com",
    sportLeague,
    team: "Chicago",
    market: "spread",
    side: "home",
    lineValue: 1.5,
    label: "Chicago +1.5",
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

  it("requires exact NFL and NCAAF proposal limits for completion", () => {
    expect(proposalSummary([proposal("a", "NFL"), proposal("b", "NFL"), proposal("c", "NCAAF")], week).complete).toBe(false);
    expect(proposalSummary([
      proposal("a", "NFL"),
      proposal("b", "NFL"),
      proposal("c", "NFL"),
      proposal("d", "NCAAF"),
      proposal("e", "NCAAF"),
      proposal("f", "NCAAF")
    ], week).complete).toBe(true);
  });

  it("blocks proposed lines beyond the sport limit", () => {
    expect(() => validateProposalQuota(week, "NCAAF", [proposal("a", "NCAAF"), proposal("b", "NCAAF"), proposal("c", "NCAAF")], undefined)).toThrow("NCAAF proposal limit");
  });

  it("excludes admin-selected lines from member proposal limits", () => {
    const adminLine = { ...proposal("admin", "NCAAF"), proposalSource: "admin_selected" as const };
    expect(proposalSummary([adminLine, proposal("a", "NCAAF"), proposal("b", "NCAAF")], week).NCAAF.submitted).toBe(2);
    expect(() => validateProposalQuota(week, "NCAAF", [adminLine, proposal("a", "NCAAF"), proposal("b", "NCAAF")], undefined)).not.toThrow();
  });

  it("allows replacing an existing proposed line when a sport limit is full", () => {
    expect(() => validateProposalQuota(week, "NCAAF", [proposal("a", "NCAAF"), proposal("b", "NCAAF"), proposal("c", "NCAAF")], "a")).not.toThrow();
  });

  it("inverts against responses while preserving pushes and pending results", () => {
    expect(responseResult("win", "with")).toBe("win");
    expect(responseResult("win", "against")).toBe("loss");
    expect(responseResult("loss", "against")).toBe("win");
    expect(responseResult("push", "against")).toBe("push");
    expect(responseResult("pending", "against")).toBe("pending");
  });

  it("creates an automatic with response for the proposal owner", () => {
    const item = proposal("a", "NFL");
    expect(selfWithResponseForProposal(item)).toMatchObject({
      leagueId: item.leagueId,
      seasonId: item.seasonId,
      weekId: item.weekId,
      proposalId: item.proposalId,
      responderId: item.proposerId,
      stance: "with",
      submittedAt: item.submittedAt,
      result: item.result
    });
  });

  it("blocks manual response changes for a member's own proposal", () => {
    expect(() => assertCanManuallyChangeProposalResponse(proposal("a", "NFL"), "user-1")).toThrow("own proposed line");
  });

  it("allows manual responses to admin-selected board lines", () => {
    const adminLine = { ...proposal("admin", "NFL"), proposerId: "LEAGUE_BOARD", proposalSource: "admin_selected" as const };
    expect(() => assertCanManuallyChangeProposalResponse(adminLine, "user-1")).not.toThrow();
  });
});
