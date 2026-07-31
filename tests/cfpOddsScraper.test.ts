import { describe, expect, it } from "vitest";
import { normalizeCfpTeamKey, parseCfpOddsPage } from "../src/backend/cfpOddsScraper";

const capturedAt = "2026-08-01T12:00:00.000Z";

function html(payload: unknown): string {
  return `<script>window.__INITIAL_STATE__ = ${JSON.stringify(payload)};</script>`;
}

describe("CFP odds parser", () => {
  it("extracts unique team outcomes from the make-playoff market", () => {
    const odds = parseCfpOddsPage(html({
      offers: [{
        marketName: "To Make the College Football Playoff",
        outcomes: [
          { outcomeId: "1", label: "Ohio State", americanOdds: "+220" },
          { outcomeId: "2", label: "Texas", displayOdds: -135 },
          { outcomeId: "3", label: "Ohio State", americanOdds: 225 }
        ]
      }]
    }), "2026", capturedAt);

    expect(odds).toHaveLength(2);
    expect(odds).toEqual(expect.arrayContaining([
      expect.objectContaining({ teamKey: "ohio-state", teamName: "Ohio State", americanOdds: 220, available: true }),
      expect.objectContaining({ teamKey: "texas", teamName: "Texas", americanOdds: -135, available: true })
    ]));
  });

  it("supports team propositions with an affirmative selection", () => {
    const odds = parseCfpOddsPage(JSON.stringify({
      markets: [{
        name: "Will Team Make the CFP?",
        offers: [
          { teamName: "Notre Dame", selections: [{ name: "Yes", odds: { american: "+180" } }, { name: "No", americanOdds: -210 }] },
          { participantName: "Georgia", selections: [{ selectionName: "Yes", oddsAmerican: -250 }] }
        ]
      }]
    }), "2026", capturedAt);

    expect(odds.map((item) => [item.teamName, item.americanOdds])).toEqual([
      ["Georgia", -250],
      ["Notre Dame", 180]
    ]);
  });

  it("ignores championship futures and fails without the target market", () => {
    expect(() => parseCfpOddsPage(html({
      markets: [{ name: "College Football Playoff Champion", outcomes: [{ label: "Georgia", americanOdds: 500 }] }]
    }), "2026", capturedAt)).toThrow(/make the College Football Playoff/i);
  });

  it("fails safely when the target market has no prices", () => {
    expect(() => parseCfpOddsPage(html({
      markets: [{ name: "To Make the College Football Playoff", outcomes: [] }]
    }), "2026", capturedAt)).toThrow(/did not contain any team prices/i);
  });

  it("normalizes stable team keys", () => {
    expect(normalizeCfpTeamKey("Texas A&M")).toBe("texas-a-and-m");
  });
});
