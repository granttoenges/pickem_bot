import type { CfpAssignment, CfpTeamOdds } from "./types";

export const CFP_ODDS_UPLOAD_SOURCE = "admin-json-upload";

export function normalizeCfpTeamKey(teamName: string): string {
  return teamName
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
}

export function parseUploadedCfpOdds(
  input: unknown,
  seasonId: string,
  capturedAt: string
): CfpTeamOdds[] {
  if (!input || typeof input !== "object" || Array.isArray(input)) {
    throw new Error("CFP odds submission must map team names to American odds.");
  }

  const entries = Object.entries(input as Record<string, unknown>);
  if (!entries.length) {
    throw new Error("CFP odds submission must contain at least one team.");
  }
  if (entries.length > 500) {
    throw new Error("CFP odds submission cannot contain more than 500 teams.");
  }

  const byTeam = new Map<string, CfpTeamOdds>();
  for (const [rawTeamName, rawOdds] of entries) {
    const teamName = rawTeamName.trim();
    if (!teamName || teamName.length > 100) {
      throw new Error("Every CFP team name must contain between 1 and 100 characters.");
    }
    const teamKey = normalizeCfpTeamKey(teamName);
    if (!teamKey) {
      throw new Error(`Could not normalize CFP team name: ${teamName}.`);
    }
    if (byTeam.has(teamKey)) {
      throw new Error(`Duplicate CFP team after normalization: ${teamName}.`);
    }
    const americanOdds = parseUploadedAmericanOdds(rawOdds);
    if (americanOdds === undefined) {
      throw new Error(`Invalid American odds for ${teamName}. Use an integer such as -800 or +154.`);
    }
    byTeam.set(teamKey, {
      seasonId,
      teamKey,
      teamName,
      americanOdds,
      available: true,
      capturedAt,
      lastSeenAt: capturedAt,
      sourceUrl: CFP_ODDS_UPLOAD_SOURCE
    });
  }

  return [...byTeam.values()].sort((a, b) => a.teamName.localeCompare(b.teamName));
}

export function parseUploadedCfpOddsText(
  input: string,
  seasonId: string,
  capturedAt: string
): CfpTeamOdds[] {
  const lines = input
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  if (!lines.length) {
    throw new Error("Paste at least one team name followed by its American odds.");
  }
  if (lines.length % 2 !== 0) {
    throw new Error("Every team line must be followed by an American odds line.");
  }

  const mapping: Record<string, unknown> = {};
  for (let index = 0; index < lines.length; index += 2) {
    const teamName = lines[index];
    if (Object.prototype.hasOwnProperty.call(mapping, teamName)) {
      throw new Error(`Duplicate CFP team: ${teamName}.`);
    }
    mapping[teamName] = lines[index + 1];
  }
  return parseUploadedCfpOdds(mapping, seasonId, capturedAt);
}

function parseUploadedAmericanOdds(value: unknown): number | undefined {
  const normalized = typeof value === "string"
    ? value.trim().replace(/[\u2212\u2012\u2013\u2014]/g, "-")
    : value;
  if (typeof normalized !== "number" && typeof normalized !== "string") {
    return undefined;
  }
  if (typeof normalized === "string" && !/^[+-]?\d+$/.test(normalized)) {
    return undefined;
  }
  const parsed = Number(normalized);
  return Number.isInteger(parsed) && Math.abs(parsed) >= 100 && Math.abs(parsed) <= 1_000_000
    ? parsed
    : undefined;
}

export function findAssignableCfpTeam(
  assignments: CfpAssignment[],
  odds: CfpTeamOdds[],
  teamKey: string
): { status: "available"; odds: CfpTeamOdds } | { status: "assigned" } | { status: "unavailable" } {
  if (assignments.some((item) => item.teamKey === teamKey)) {
    return { status: "assigned" };
  }
  const selected = odds.find((item) => item.teamKey === teamKey && item.available);
  return selected ? { status: "available", odds: selected } : { status: "unavailable" };
}

export function buildCfpAssignment(input: {
  leagueId: string;
  seasonId: string;
  userId: string;
  assignedBy: string;
  assignedAt: string;
  odds: CfpTeamOdds;
}): CfpAssignment {
  return {
    leagueId: input.leagueId,
    seasonId: input.seasonId,
    teamKey: input.odds.teamKey,
    teamName: input.odds.teamName,
    userId: input.userId,
    pickedOdds: input.odds.americanOdds,
    assignedAt: input.assignedAt,
    assignedBy: input.assignedBy
  };
}

export function mergeCfpTeamOdds(current: CfpTeamOdds[], incoming: CfpTeamOdds[]): CfpTeamOdds[] {
  if (!incoming.length) {
    throw new Error("A valid CFP scrape must contain at least one team price.");
  }
  const merged = new Map(current.map((item) => [item.teamKey, { ...item, available: false }]));
  for (const item of incoming) {
    merged.set(item.teamKey, { ...item, available: true });
  }
  return [...merged.values()].sort((a, b) => a.teamName.localeCompare(b.teamName));
}
