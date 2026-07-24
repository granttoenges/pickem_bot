export type SportLeague = "NFL" | "NCAAF";
export type AppLeagueStatus = "active" | "archived";
export type LeagueMemberRole = "league_admin" | "player";
export type Market = "spread" | "team_total";
export type PickSide = "home" | "away" | "over" | "under";
export type PickResult = "win" | "loss" | "push" | "pending";

export interface AppLeague {
  leagueId: string;
  name: string;
  createdBy: string;
  createdAt: string;
  status: AppLeagueStatus;
}

export interface LeagueMember {
  leagueId: string;
  userId: string;
  email?: string;
  role: LeagueMemberRole;
  createdAt: string;
}

export interface Week {
  leagueId: string;
  seasonId: string;
  weekId: string;
  label: string;
  cutoffAt: string;
  status: "draft" | "open" | "locked" | "graded";
  nflPickCountRequired: number;
  ncaafPickCountRequired: number;
}

export interface Game {
  leagueId: string;
  gameId: string;
  seasonId: string;
  weekId: string;
  sportLeague: SportLeague;
  league?: SportLeague;
  awayTeam: string;
  homeTeam: string;
  kickoffAt: string;
  status: "scheduled" | "final";
  homeScore?: number;
  awayScore?: number;
  adminNote?: string;
  overrideSource?: "draftkings" | "admin_override";
}

export interface OpeningLine {
  gameId: string;
  market: Market;
  source: "draftkings" | "admin_override" | "seed";
  capturedAt: string;
  homeSpread?: number;
  awaySpread?: number;
  homeTeamTotal?: number;
  awayTeamTotal?: number;
  originalPayload?: unknown;
}

export interface PickOption {
  leagueId: string;
  seasonId: string;
  weekId: string;
  optionId: string;
  gameId: string;
  sportLeague: SportLeague;
  team: string;
  market: Market;
  side: PickSide;
  lineValue: number;
  label: string;
}

export interface PickClaim {
  leagueId: string;
  seasonId: string;
  weekId: string;
  optionId: string;
  userId: string;
  claimedAt: string;
}

export interface PlayerPick extends PickClaim {
  gameId: string;
  sportLeague: SportLeague;
  team: string;
  market: Market;
  side: PickSide;
  lineValue: number;
  submittedAt: string;
  result: PickResult;
}

export interface GameWithOptions extends Game {
  lines: OpeningLine[];
  options: PickOption[];
}

export interface Standing {
  leagueId: string;
  userId: string;
  displayName: string;
  wins: number;
  losses: number;
  pushes: number;
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
