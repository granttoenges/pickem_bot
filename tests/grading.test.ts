import { describe, expect, it } from "vitest";
import { gradePick } from "../src/backend/grading";
import type { Game, OpeningLine, PlayerPick } from "../src/backend/types";

const game: Game = {
  gameId: "game-1",
  seasonId: "2026",
  weekId: "1",
  league: "NFL",
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
  seasonId: "2026",
  weekId: "1",
  gameId: "game-1",
  userId: "user-1",
  market: "spread",
  selectedTeam: "Chicago",
  submittedAt: "2026-09-10T15:00:00.000Z",
  result: "pending"
};

describe("gradePick", () => {
  it("grades spread picks against the stored opening line", () => {
    expect(gradePick(game, spreadLine, basePick).result).toBe("win");
  });

  it("grades moneyline picks by winner", () => {
    expect(gradePick(game, { ...spreadLine, market: "moneyline" }, { ...basePick, market: "moneyline" }).result).toBe("win");
  });
});
