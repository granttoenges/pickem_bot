import { describe, expect, it } from "vitest";
import { gradePick, gradeProposal } from "../src/backend/grading";
import type { Game, LineProposal, OpeningLine, PlayerPick } from "../src/backend/types";

const game: Game = {
  leagueId: "friends",
  gameId: "game-1",
  seasonId: "2026",
  weekId: "1",
  sportLeague: "NFL",
  awayTeam: "Green Bay",
  homeTeam: "Chicago",
  kickoffAt: "2026-09-13T18:00:00.000Z",
  status: "final",
  awayScore: 20,
  homeScore: 24
};

const spreadLine: OpeningLine = {
  gameId: "game-1",
  market: "spread",
  source: "draftkings",
  capturedAt: "2026-09-08T15:00:00.000Z",
  homeSpread: 2.5,
  awaySpread: -2.5
};

const basePick: PlayerPick = {
  leagueId: "friends",
  seasonId: "2026",
  weekId: "1",
  optionId: "game-1-home-spread",
  gameId: "game-1",
  userId: "user-1",
  claimedAt: "2026-09-10T15:00:00.000Z",
  sportLeague: "NFL",
  market: "spread",
  team: "Chicago",
  side: "home",
  lineValue: 2.5,
  submittedAt: "2026-09-10T15:00:00.000Z",
  result: "pending"
};

const baseProposal: LineProposal = {
  leagueId: "friends",
  seasonId: "2026",
  weekId: "1",
  proposalId: "user-1::game-1-home-spread",
  optionId: "game-1-home-spread",
  gameId: "game-1",
  proposerId: "user-1",
  proposerLabel: "user@example.com",
  sportLeague: "NFL",
  market: "spread",
  team: "Chicago",
  side: "home",
  lineValue: 2.5,
  label: "Chicago +2.5",
  submittedAt: "2026-09-10T15:00:00.000Z",
  result: "pending"
};

describe("gradePick", () => {
  it("grades spread picks against the stored opening line", () => {
    expect(gradePick(game, spreadLine, basePick).result).toBe("win");
  });

  it("grades team total picks against the stored opening line", () => {
    expect(gradePick(
      game,
      { ...spreadLine, market: "team_total", homeTeamTotal: 23.5 },
      { ...basePick, optionId: "game-1-home-total-over", market: "team_total", side: "over", lineValue: 23.5 }
    ).result).toBe("win");
  });

  it("grades game total picks against the stored opening line", () => {
    expect(gradePick(
      game,
      { ...spreadLine, market: "game_total", gameTotal: 43.5 },
      { ...basePick, optionId: "game-1-game-total-over", team: "Green Bay/Chicago", market: "game_total", side: "over", lineValue: 43.5 }
    ).result).toBe("win");
    expect(gradePick(
      game,
      { ...spreadLine, market: "game_total", gameTotal: 44.5 },
      { ...basePick, optionId: "game-1-game-total-under", team: "Green Bay/Chicago", market: "game_total", side: "under", lineValue: 44.5 }
    ).result).toBe("win");
    expect(gradePick(
      game,
      { ...spreadLine, market: "game_total", gameTotal: 44 },
      { ...basePick, optionId: "game-1-game-total-under", team: "Green Bay/Chicago", market: "game_total", side: "under", lineValue: 44 }
    ).result).toBe("push");
  });

  it("grades proposed lines against the stored opening line", () => {
    expect(gradeProposal(game, spreadLine, baseProposal).result).toBe("win");
  });
});
