import type { EventBridgeEvent } from "aws-lambda";
import { PickemRepository } from "./repository";
import type { Game, OpeningLine, ScrapeRun } from "./types";

const defaultUrls = {
  NFL: "https://sportsbook.draftkings.com/leagues/football/nfl",
  NCAAF: "https://sportsbook.draftkings.com/leagues/football/ncaaf"
} as const;

interface ScraperDetail {
  seasonId?: string;
  weekId?: string;
  leagueId?: string;
}

export async function handler(event: EventBridgeEvent<"Scheduled Event", ScraperDetail>): Promise<{
  games: Game[];
  lines: OpeningLine[];
  errors: string[];
}> {
  const seasonId = event.detail?.seasonId ?? process.env.DEFAULT_SEASON_ID ?? new Date().getUTCFullYear().toString();
  const weekId = event.detail?.weekId ?? process.env.DEFAULT_WEEK_ID ?? "current";
  const leagueId = event.detail?.leagueId ?? process.env.DEFAULT_APP_LEAGUE_ID ?? "shared";
  const capturedAt = new Date().toISOString();
  const repository = new PickemRepository();
  const games: Game[] = [];
  const lines: OpeningLine[] = [];
  const errors: string[] = [];

  for (const [league, sourceUrl] of Object.entries(defaultUrls)) {
    try {
      const html = await fetchPage(sourceUrl);
      const parsed = parseDraftKingsPage(html, leagueId, league as "NFL" | "NCAAF", seasonId, weekId, capturedAt, sourceUrl);
      games.push(...parsed.games);
      lines.push(...parsed.lines);
    } catch (error) {
      errors.push(`${league}: ${error instanceof Error ? error.message : "Unknown scraper error."}`);
    }
  }

  for (const game of games) {
    await repository.putSharedGame(game);
  }

  let skipped = 0;
  for (const line of lines) {
    const created = await repository.createOpeningLine(line);
    if (!created) {
      skipped += 1;
    }
  }

  const run: ScrapeRun = {
    seasonId,
    weekId,
    runId: capturedAt,
    sourceUrl: Object.values(defaultUrls).join(","),
    capturedAt,
    status: errors.length === 0 ? "success" : games.length > 0 ? "partial" : "failed",
    parsedGameCount: games.length,
    errors: skipped ? [...errors, `${skipped} opening lines already existed and were not overwritten.`] : errors
  };
  await repository.putScrapeRun(run);

  return { games, lines, errors: run.errors };
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      "accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8"
    }
  });
  if (!response.ok) {
    throw new Error(`DraftKings returned HTTP ${response.status}.`);
  }
  return response.text();
}

export function parseDraftKingsPage(
  html: string,
  leagueId: string,
  league: "NFL" | "NCAAF",
  seasonId: string,
  weekId: string,
  capturedAt: string,
  sourceUrl: string
): { games: Game[]; lines: OpeningLine[] } {
  const payload = extractInitialState(html);
  if (!payload) {
    throw new Error("Could not find DraftKings initial state.");
  }

  const eventNodes = findEvents(payload);
  const games: Game[] = [];
  const lines: OpeningLine[] = [];

  for (const [index, event] of eventNodes.entries()) {
    const homeTeam = firstString(event, ["homeTeamName", "homeTeam", "home_team", "homeName", "home"]);
    const awayTeam = firstString(event, ["awayTeamName", "awayTeam", "away_team", "awayName", "away"]);
    const kickoffAt = firstString(event, ["startDate", "startTime", "commenceTime", "eventStartDate"]);
    if (!homeTeam || !awayTeam || !kickoffAt) {
      continue;
    }

    const gameId = stableGameId(league, kickoffAt, awayTeam, homeTeam);
    games.push({
      leagueId,
      gameId,
      seasonId,
      weekId,
      sportLeague: league,
      awayTeam,
      homeTeam,
      kickoffAt,
      status: "scheduled",
      overrideSource: "draftkings"
    });

    const rawPayload = safeOriginalPayload(event, sourceUrl, index);
    const marketIds = collectMarketIds(event);
    const spread = firstNumber(event, ["homeSpread", "homeSpreadPoints", "spread", "line", "points"]);
    if (spread !== undefined) {
      lines.push({
        gameId,
        market: "spread",
        source: "draftkings",
        capturedAt,
        sourceUrl,
        draftkingsMarketIds: marketIds,
        homeSpread: spread,
        awaySpread: -spread,
        homeSpreadOdds: firstNumber(event, ["homeSpreadOdds", "homeSpreadPrice", "homeSpreadAmericanOdds", "homeSpreadDecimalOdds"]),
        awaySpreadOdds: firstNumber(event, ["awaySpreadOdds", "awaySpreadPrice", "awaySpreadAmericanOdds", "awaySpreadDecimalOdds"]),
        originalPayload: rawPayload,
        rawPayloadTrimmed: isTrimmedPayload(rawPayload)
      });
    }

    const homeTeamTotal = firstNumber(event, ["homeTeamTotal", "homeTotal", "homeTeamTotalPoints", "homePoints"]);
    const awayTeamTotal = firstNumber(event, ["awayTeamTotal", "awayTotal", "awayTeamTotalPoints", "awayPoints"]);
    if (homeTeamTotal !== undefined || awayTeamTotal !== undefined) {
      lines.push({
        gameId,
        market: "team_total",
        source: "draftkings",
        capturedAt,
        sourceUrl,
        draftkingsMarketIds: marketIds,
        homeTeamTotal,
        awayTeamTotal,
        homeTeamTotalOverOdds: firstNumber(event, ["homeTeamTotalOverOdds", "homeOverOdds", "homeTeamOverPrice"]),
        homeTeamTotalUnderOdds: firstNumber(event, ["homeTeamTotalUnderOdds", "homeUnderOdds", "homeTeamUnderPrice"]),
        awayTeamTotalOverOdds: firstNumber(event, ["awayTeamTotalOverOdds", "awayOverOdds", "awayTeamOverPrice"]),
        awayTeamTotalUnderOdds: firstNumber(event, ["awayTeamTotalUnderOdds", "awayUnderOdds", "awayTeamUnderPrice"]),
        originalPayload: rawPayload,
        rawPayloadTrimmed: isTrimmedPayload(rawPayload)
      });
    }

    const homeMoneyline = firstNumber(event, ["homeMoneyline", "homeMoneyLine", "homeMl", "homeOdds", "homePrice"]);
    const awayMoneyline = firstNumber(event, ["awayMoneyline", "awayMoneyLine", "awayMl", "awayOdds", "awayPrice"]);
    if (homeMoneyline !== undefined || awayMoneyline !== undefined) {
      lines.push({
        gameId,
        market: "moneyline",
        source: "draftkings",
        capturedAt,
        sourceUrl,
        draftkingsMarketIds: marketIds,
        homeMoneyline,
        awayMoneyline,
        originalPayload: rawPayload,
        rawPayloadTrimmed: isTrimmedPayload(rawPayload)
      });
    }
  }

  return { games, lines };
}

function extractInitialState(html: string): unknown {
  const match = html.match(/window\.__INITIAL_STATE__ = (.*?);\s*<\/script>/s);
  return match ? JSON.parse(match[1]) : undefined;
}

function findEvents(node: unknown): Array<Record<string, unknown>> {
  const events: Array<Record<string, unknown>> = [];
  visit(node, (value) => {
    const hasHome = ["homeTeamName", "homeTeam", "home_team", "homeName", "home"].some((key) => typeof value[key] === "string");
    const hasAway = ["awayTeamName", "awayTeam", "away_team", "awayName", "away"].some((key) => typeof value[key] === "string");
    if (hasHome && hasAway) {
      events.push(value);
    }
  });
  return events;
}

function visit(node: unknown, callback: (value: Record<string, unknown>) => void): void {
  if (Array.isArray(node)) {
    for (const item of node) {
      visit(item, callback);
    }
    return;
  }
  if (node && typeof node === "object") {
    const value = node as Record<string, unknown>;
    callback(value);
    for (const child of Object.values(value)) {
      visit(child, callback);
    }
  }
}

function firstString(node: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = node[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return undefined;
}

function firstNumber(node: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const value = node[key];
    if (typeof value === "number") {
      return value;
    }
    if (typeof value === "string") {
      const match = value.replace("−", "-").match(/[-+]?\d+(?:\.\d+)?/);
      if (match) {
        return Number(match[0]);
      }
    }
  }
  return undefined;
}

function collectMarketIds(node: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  visit(node, (value) => {
    for (const key of ["marketId", "market_id", "id", "selectionId", "selection_id", "outcomeId", "outcome_id"]) {
      const item = value[key];
      if (typeof item === "string" && item.trim()) {
        ids.add(item.trim());
      }
      if (typeof item === "number") {
        ids.add(String(item));
      }
    }
  });
  return [...ids].slice(0, 50);
}

function safeOriginalPayload(event: Record<string, unknown>, sourceUrl: string, eventIndex: number): unknown {
  const raw = { sourceUrl, eventIndex, event };
  const serialized = JSON.stringify(raw);
  if (serialized.length <= 300_000) {
    return raw;
  }
  return {
    sourceUrl,
    eventIndex,
    trimmed: true,
    topLevelKeys: Object.keys(event).slice(0, 100),
    draftkingsMarketIds: collectMarketIds(event)
  };
}

function isTrimmedPayload(payload: unknown): boolean {
  return Boolean(payload && typeof payload === "object" && "trimmed" in payload);
}

function stableGameId(league: string, kickoffAt: string, awayTeam: string, homeTeam: string): string {
  return `${league}-${kickoffAt}-${awayTeam}-${homeTeam}`.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}
