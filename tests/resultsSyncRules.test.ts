import { describe, expect, it } from "vitest";
import { buildStandings, findMatchingFinalScore, gradeProposalAndResponses, parseEspnScoreboard } from "../src/backend/resultsSyncRules";
import type { Game, LeagueMember, LineProposal, OpeningLine, ProposalResponse } from "../src/backend/types";

const game: Game = {
  leagueId: "friends",
  gameId: "game-1",
  seasonId: "2026",
  weekId: "1",
  sportLeague: "NFL",
  awayTeam: "Green Bay Packers",
  homeTeam: "Chicago Bears",
  kickoffAt: "2026-09-13T18:00:00.000Z",
  status: "scheduled"
};

const proposal: LineProposal = {
  leagueId: "friends",
  seasonId: "2026",
  weekId: "1",
  proposalId: "proposal-1",
  optionId: "game-1-away-spread",
  gameId: "game-1",
  proposerId: "user-1",
  proposerLabel: "one@example.com",
  proposalSource: "member",
  sportLeague: "NFL",
  team: "Green Bay Packers",
  market: "spread",
  side: "away",
  lineValue: -2.5,
  label: "Green Bay Packers -2.5",
  submittedAt: "2026-09-10T15:00:00.000Z",
  result: "pending"
};

const line: OpeningLine = {
  gameId: "game-1",
  market: "spread",
  source: "seed",
  capturedAt: "2026-09-09T15:00:00.000Z",
  awaySpread: -2.5,
  homeSpread: 2.5
};

describe("results sync rules", () => {
  it("parses final scores from ESPN scoreboard payloads", () => {
    const scores = parseEspnScoreboard({
      events: [{
        id: "1",
        date: "2026-09-13T18:00:00.000Z",
        competitions: [{
          status: { type: { completed: true } },
          competitors: [
            { homeAway: "away", score: "24", team: { displayName: "Green Bay Packers" } },
            { homeAway: "home", score: "20", team: { displayName: "Chicago Bears" } }
          ]
        }]
      }]
    }, "NFL");

    expect(scores).toEqual([{
      sportLeague: "NFL",
      awayTeam: "Green Bay Packers",
      homeTeam: "Chicago Bears",
      awayScore: 24,
      homeScore: 20,
      completed: true,
      kickoffAt: "2026-09-13T18:00:00.000Z",
      sourceId: "1"
    }]);
    expect(findMatchingFinalScore(game, scores)?.awayScore).toBe(24);
  });

  it("grades proposal responses and aggregates standings", () => {
    const finalGame = { ...game, status: "final" as const, awayScore: 24, homeScore: 20 };
    const responses: ProposalResponse[] = [
      { leagueId: "friends", seasonId: "2026", weekId: "1", proposalId: "proposal-1", responderId: "user-1", stance: "with", submittedAt: "2026-09-10T15:00:00.000Z", result: "pending" },
      { leagueId: "friends", seasonId: "2026", weekId: "1", proposalId: "proposal-1", responderId: "user-2", stance: "against", submittedAt: "2026-09-10T15:00:00.000Z", result: "pending" }
    ];
    const graded = gradeProposalAndResponses(finalGame, [line], proposal, responses);
    expect(graded?.proposal.result).toBe("win");
    expect(graded?.responses.map((response) => response.result)).toEqual(["win", "loss"]);

    const members: LeagueMember[] = [
      { leagueId: "friends", userId: "user-1", email: "one@example.com", role: "player", createdAt: "2026-09-01T00:00:00.000Z" },
      { leagueId: "friends", userId: "user-2", email: "two@example.com", role: "player", createdAt: "2026-09-01T00:00:00.000Z" }
    ];
    const standings = buildStandings("friends", "2026", members, [graded?.proposal ?? proposal], graded?.responses ?? responses, "2026-09-14T12:00:00.000Z");
    expect(standings.map((row) => [row.displayName, row.wins, row.losses, row.winPercentage])).toEqual([
      ["one@example.com", 1, 0, 1],
      ["two@example.com", 0, 1, 0]
    ]);
  });
});
