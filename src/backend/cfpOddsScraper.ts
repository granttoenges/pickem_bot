import { PickemRepository } from "./repository";
import { normalizeCfpTeamKey } from "./cfpRules";
import type { CfpScrapeRun, CfpTeamOdds } from "./types";

export { normalizeCfpTeamKey } from "./cfpRules";

export const CFP_ODDS_URL = "https://sportsbook.draftkings.com/page/college-football-playoffs-odds";

interface CfpScraperEvent {
  seasonId?: string;
}

export async function handler(event: CfpScraperEvent = {}): Promise<{ odds: CfpTeamOdds[]; errors: string[] }> {
  const seasonId = event.seasonId ?? new Date().getUTCFullYear().toString();
  const capturedAt = new Date().toISOString();
  const repository = new PickemRepository();
  try {
    const html = await fetchPage(CFP_ODDS_URL);
    const odds = parseCfpOddsPage(html, seasonId, capturedAt, CFP_ODDS_URL);
    await repository.replaceCurrentCfpTeamOdds(seasonId, odds);
    await repository.putCfpScrapeRun(scrapeRun(seasonId, capturedAt, "success", odds.length, []));
    return { odds, errors: [] };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown CFP scraper error.";
    await repository.putCfpScrapeRun(scrapeRun(seasonId, capturedAt, "failed", 0, [message]));
    throw error;
  }
}

async function fetchPage(url: string): Promise<string> {
  const response = await fetch(url, {
    headers: {
      "user-agent": "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 Chrome/126 Safari/537.36",
      accept: "text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8"
    }
  });
  if (!response.ok) {
    throw new Error(`DraftKings returned HTTP ${response.status}.`);
  }
  return response.text();
}

export function parseCfpOddsPage(htmlOrJson: string, seasonId: string, capturedAt: string, sourceUrl = CFP_ODDS_URL): CfpTeamOdds[] {
  const payload = parsePayload(htmlOrJson);
  const markets = findTargetMarkets(payload);
  if (!markets.length) {
    throw new Error("Could not find the DraftKings market for teams to make the College Football Playoff.");
  }

  const byTeam = new Map<string, CfpTeamOdds>();
  for (const market of markets) {
    collectMarketOdds(market, undefined, (teamName, americanOdds, outcomeId) => {
      const teamKey = normalizeCfpTeamKey(teamName);
      if (!teamKey || byTeam.has(teamKey)) {
        return;
      }
      byTeam.set(teamKey, {
        seasonId,
        teamKey,
        teamName: teamName.trim(),
        americanOdds,
        draftkingsOutcomeId: outcomeId,
        available: true,
        capturedAt,
        lastSeenAt: capturedAt,
        sourceUrl
      });
    });
  }
  const odds = [...byTeam.values()].sort((a, b) => a.teamName.localeCompare(b.teamName));
  if (!odds.length) {
    throw new Error("The DraftKings CFP market did not contain any team prices.");
  }
  return odds;
}

function parsePayload(htmlOrJson: string): unknown {
  const trimmed = htmlOrJson.trim();
  if (trimmed.startsWith("{") || trimmed.startsWith("[")) {
    return JSON.parse(trimmed);
  }
  const match = htmlOrJson.match(/window\.__INITIAL_STATE__ = (.*?);\s*<\/script>/s);
  if (!match) {
    throw new Error("Could not find DraftKings initial state.");
  }
  return JSON.parse(match[1]);
}

function findTargetMarkets(node: unknown): Array<Record<string, unknown>> {
  const markets: Array<Record<string, unknown>> = [];
  visit(node, (value) => {
    const title = firstString(value, ["marketName", "name", "label", "title", "offerLabel", "subcategoryName"]);
    if (title && isMakePlayoffMarket(title)) {
      markets.push(value);
    }
  });
  return markets;
}

function isMakePlayoffMarket(value: string): boolean {
  const normalized = value.toLowerCase().replace(/[^a-z0-9]+/g, " ");
  const playoff = normalized.includes("playoff") || /\bcfp\b/.test(normalized);
  const make = normalized.includes("make") || normalized.includes("qualify") || normalized.includes("reach");
  const excluded = normalized.includes("champion") || normalized.includes("winner") || normalized.includes("win the");
  return playoff && make && !excluded;
}

function collectMarketOdds(
  node: unknown,
  inheritedTeam: string | undefined,
  add: (teamName: string, americanOdds: number, outcomeId?: string) => void
): void {
  if (Array.isArray(node)) {
    for (const child of node) {
      collectMarketOdds(child, inheritedTeam, add);
    }
    return;
  }
  if (!node || typeof node !== "object") {
    return;
  }
  const value = node as Record<string, unknown>;
  const explicitTeam = firstString(value, ["teamName", "participantName", "participant", "competitorName"]);
  const label = firstString(value, ["outcomeName", "selectionName", "label", "name", "displayName"]);
  const nextInheritedTeam = explicitTeam ?? (label && !isAffirmative(label) && !isNegative(label) && !isGenericLabel(label) ? label : inheritedTeam);
  const odds = firstAmericanOdds(value);
  const teamName = label && isAffirmative(label) ? inheritedTeam : explicitTeam ?? label;
  if (odds !== undefined && teamName && !isAffirmative(teamName) && !isNegative(teamName) && !isGenericLabel(teamName)) {
    add(teamName, odds, firstId(value));
  } else if (odds !== undefined && label && isAffirmative(label) && inheritedTeam) {
    add(inheritedTeam, odds, firstId(value));
  }
  for (const child of Object.values(value)) {
    collectMarketOdds(child, nextInheritedTeam, add);
  }
}

function firstAmericanOdds(value: Record<string, unknown>): number | undefined {
  const keys = ["americanOdds", "oddsAmerican", "american", "displayOdds", "odds", "price"];
  for (const key of keys) {
    const candidate = value[key];
    const parsed = parseAmericanOdds(candidate);
    if (parsed !== undefined) {
      return parsed;
    }
    if (candidate && typeof candidate === "object" && !Array.isArray(candidate)) {
      for (const nestedKey of ["american", "americanOdds", "displayOdds", "value"]) {
        const nested = parseAmericanOdds((candidate as Record<string, unknown>)[nestedKey]);
        if (nested !== undefined) {
          return nested;
        }
      }
    }
  }
  return undefined;
}

function parseAmericanOdds(value: unknown): number | undefined {
  if (typeof value === "number" && Number.isInteger(value) && Math.abs(value) >= 100) {
    return value;
  }
  if (typeof value === "string" && /^[+-]?\d{3,}$/.test(value.trim())) {
    const parsed = Number(value);
    return Number.isInteger(parsed) && Math.abs(parsed) >= 100 ? parsed : undefined;
  }
  return undefined;
}

function firstId(value: Record<string, unknown>): string | undefined {
  const id = value.outcomeId ?? value.selectionId ?? value.id;
  return typeof id === "string" || typeof id === "number" ? String(id) : undefined;
}

function firstString(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const candidate = value[key];
    if (typeof candidate === "string" && candidate.trim()) {
      return candidate.trim();
    }
  }
  return undefined;
}

function isAffirmative(value: string): boolean {
  return /^(yes|to make|make)$/i.test(value.trim());
}

function isNegative(value: string): boolean {
  return /^(no|not to make|miss)$/i.test(value.trim());
}

function isGenericLabel(value: string): boolean {
  return isMakePlayoffMarket(value) || /^(odds|outcomes?|selections?|offers?|market)$/i.test(value.trim());
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

function scrapeRun(
  seasonId: string,
  capturedAt: string,
  status: CfpScrapeRun["status"],
  parsedTeamCount: number,
  errors: string[]
): CfpScrapeRun {
  return {
    seasonId,
    runId: capturedAt,
    sourceUrl: CFP_ODDS_URL,
    capturedAt,
    status,
    parsedTeamCount,
    errors
  };
}
