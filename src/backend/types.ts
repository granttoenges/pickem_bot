export type League = "NFL" | "NCAAF";
export type Market = "spread" | "moneyline";
export type PickResult = "win" | "loss" | "push" | "pending";

export interface Week {
  seasonId: string;
  weekId: string;
  label: string;
  cutoffAt: string;
  status: "draft" | "open" | "locked" | "graded";
}

export interface Game {
  gameId: string;
  seasonId: string;
  weekId: string;
  league: League;
  awayTeam: string;
  homeTeam: string;
  kickoffAt: string;
  status: "scheduled" | "final";
  homeScore?: number;
  awayScore?: number;
}

export interface OpeningLine {
  gameId: string;
  market: Market;
  source: "draftkings" | "admin_override";
  capturedAt: string;
  homeSpread?: number;
  awaySpread?: number;
  homeMoneyline?: number;
  awayMoneyline?: number;
  originalPayload?: unknown;
}

export interface PlayerPick {
  seasonId: string;
  weekId: string;
  gameId: string;
  userId: string;
  market: Market;
  selectedTeam: string;
  submittedAt: string;
  result: PickResult;
}

export interface GradedPick extends PlayerPick {
  result: Exclude<PickResult, "pending">;
}

export interface ScrapeRun {
  seasonId: string;
  weekId: string;
  runId: string;
  sourceUrl: string;
  capturedAt: string;
  status: "success" | "partial" | "failed";
  parsedGameCount: number;
  errors: string[];
}
