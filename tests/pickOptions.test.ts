import { describe, expect, it } from "vitest";
import { buildPickOptions } from "../src/backend/api";
import type { Game, OpeningLine } from "../src/backend/types";

const game: Game = {
  leagueId: "friends",
  gameId: "game-1",
  seasonId: "2026",
  weekId: "1",
  sportLeague: "NFL",
  awayTeam: "Packers",
  homeTeam: "Bears",
  kickoffAt: "2026-09-13T18:00:00.000Z",
  status: "scheduled"
};

describe("pick option generation", () => {
  it("creates over and under options from a game total opening line", () => {
    const gameTotal: OpeningLine = {
      gameId: game.gameId,
      market: "game_total",
      source: "seed",
      capturedAt: "2026-09-08T15:00:00.000Z",
      gameTotal: 44.5
    };

    expect(buildPickOptions(game, [gameTotal])).toEqual([
      expect.objectContaining({
        optionId: "game-1-game-total-over",
        market: "game_total",
        side: "over",
        lineValue: 44.5,
        label: "Packers/Bears over 44.5"
      }),
      expect.objectContaining({
        optionId: "game-1-game-total-under",
        market: "game_total",
        side: "under",
        lineValue: 44.5,
        label: "Packers/Bears under 44.5"
      })
    ]);
  });
});
