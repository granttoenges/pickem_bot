import { describe, expect, it } from "vitest";
import { parseDraftKingsPage } from "../src/backend/draftkingsScraper";

describe("DraftKings parser", () => {
  it("stores normalized spread, team total, game total, moneyline, and raw payload data", () => {
    const html = `<script>window.__INITIAL_STATE__ = ${JSON.stringify({
      events: [
        {
          id: "event-1",
          marketId: "market-1",
          homeTeamName: "Bears",
          awayTeamName: "Packers",
          startDate: "2026-09-13T18:00:00.000Z",
          homeSpread: 1.5,
          homeSpreadOdds: -110,
          awaySpreadOdds: -110,
          homeTeamTotal: 21.5,
          awayTeamTotal: 22.5,
          homeTeamTotalOverOdds: -115,
          awayTeamTotalUnderOdds: -105,
          gameTotal: 44.5,
          gameTotalOverOdds: -108,
          gameTotalUnderOdds: -112,
          homeMoneyline: 105,
          awayMoneyline: -125
        }
      ]
    })};</script>`;

    const parsed = parseDraftKingsPage(html, "friends", "NFL", "2026", "1", "2026-09-08T15:00:00.000Z", "https://example.test/dk");
    expect(parsed.games).toHaveLength(1);
    expect(parsed.lines.map((line) => line.market).sort()).toEqual(["game_total", "moneyline", "spread", "team_total"]);
    expect(parsed.lines.find((line) => line.market === "spread")).toMatchObject({
      homeSpread: 1.5,
      awaySpread: -1.5,
      homeSpreadOdds: -110,
      awaySpreadOdds: -110,
      sourceUrl: "https://example.test/dk"
    });
    expect(parsed.lines.find((line) => line.market === "team_total")).toMatchObject({
      homeTeamTotal: 21.5,
      awayTeamTotal: 22.5,
      homeTeamTotalOverOdds: -115,
      awayTeamTotalUnderOdds: -105
    });
    expect(parsed.lines.find((line) => line.market === "game_total")).toMatchObject({
      gameTotal: 44.5,
      gameTotalOverOdds: -108,
      gameTotalUnderOdds: -112
    });
    expect(parsed.lines.find((line) => line.market === "moneyline")).toMatchObject({
      homeMoneyline: 105,
      awayMoneyline: -125,
      rawPayloadTrimmed: false
    });
  });
});
