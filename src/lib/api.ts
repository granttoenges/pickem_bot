"use client";

import { appConfig } from "./config";
import { getStoredSession } from "./auth";

export type SportLeague = "NFL" | "NCAAF";
export type PickMode = "member_proposed" | "admin_selected";
export type Market = "spread" | "team_total" | "game_total" | "moneyline";
export type PickSide = "home" | "away" | "over" | "under";
export type PickResult = "win" | "loss" | "push" | "pending";
export type ProposalResponseStance = "with" | "against";

export interface AppLeague {
  leagueId: string;
  name: string;
  status: string;
  pickMode?: PickMode;
}

export interface OpeningLine {
  gameId: string;
  market: Market;
  source: "draftkings" | "admin_override" | "seed";
  capturedAt: string;
  sourceUrl?: string;
  draftkingsMarketIds?: string[];
  homeSpread?: number;
  awaySpread?: number;
  homeSpreadOdds?: number;
  awaySpreadOdds?: number;
  homeTeamTotal?: number;
  awayTeamTotal?: number;
  homeTeamTotalOverOdds?: number;
  homeTeamTotalUnderOdds?: number;
  awayTeamTotalOverOdds?: number;
  awayTeamTotalUnderOdds?: number;
  gameTotal?: number;
  gameTotalOverOdds?: number;
  gameTotalUnderOdds?: number;
  homeMoneyline?: number;
  awayMoneyline?: number;
  rawPayloadTrimmed?: boolean;
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

export interface GameWithOptions {
  leagueId: string;
  gameId: string;
  seasonId: string;
  weekId: string;
  sportLeague: SportLeague;
  awayTeam: string;
  homeTeam: string;
  kickoffAt: string;
  status: "scheduled" | "final";
  homeScore?: number;
  awayScore?: number;
  adminNote?: string;
  overrideSource?: string;
  lines: OpeningLine[];
  options: PickOption[];
}

export interface Week {
  leagueId: string;
  seasonId: string;
  weekId: string;
  label: string;
  cutoffAt: string;
  scrapeAt?: string;
  scrapeStatus?: "pending" | "running" | "completed" | "partial" | "failed";
  scrapeCompletedAt?: string;
  status: string;
  nflPickCountRequired: number;
  ncaafPickCountRequired: number;
}

export interface PlayerPick {
  leagueId: string;
  seasonId: string;
  weekId: string;
  optionId: string;
  gameId: string;
  userId: string;
  sportLeague: SportLeague;
  team: string;
  market: Market;
  side: PickSide;
  lineValue: number;
  submittedAt: string;
  result: string;
}

export interface LineProposal {
  leagueId: string;
  seasonId: string;
  weekId: string;
  proposalId: string;
  optionId: string;
  gameId: string;
  proposerId: string;
  proposerLabel?: string;
  proposalSource?: "member" | "admin_selected";
  sportLeague: SportLeague;
  team: string;
  market: Market;
  side: PickSide;
  lineValue: number;
  label: string;
  submittedAt: string;
  result: PickResult;
}

export interface ProposalResponse {
  leagueId: string;
  seasonId: string;
  weekId: string;
  proposalId: string;
  responderId: string;
  stance: ProposalResponseStance;
  submittedAt: string;
  result: PickResult;
}

export interface LeagueMember {
  leagueId: string;
  userId: string;
  email?: string;
  role: "league_admin" | "player";
  createdAt: string;
}

export interface ScrapeRun {
  capturedAt: string;
  status: string;
  parsedGameCount: number;
  errors: string[];
}

export interface Standing {
  leagueId: string;
  seasonId?: string;
  userId: string;
  displayName: string;
  wins: number;
  losses: number;
  pushes: number;
  winPercentage?: number;
  lastUpdatedAt?: string;
}

export interface PickSummary {
  NFL: { submitted: number; required: number; complete: boolean };
  NCAAF: { submitted: number; required: number; complete: boolean };
  complete: boolean;
}

export type ProposalSummary = PickSummary;

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
}

export async function apiSend<T>(path: string, method: "POST" | "PUT" | "DELETE", body: unknown): Promise<T> {
  return apiRequest<T>(path, {
    method,
    body: JSON.stringify(body)
  });
}

async function apiRequest<T>(path: string, init: RequestInit): Promise<T> {
  if (!appConfig.apiBaseUrl) {
    throw new Error("API URL is not configured.");
  }
  const session = getStoredSession();
  const response = await fetch(`${appConfig.apiBaseUrl}${path}`, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(session ? { authorization: `Bearer ${session.idToken}` } : {}),
      ...init.headers
    }
  });
  const payload = await response.json().catch(() => ({}));
  if (!response.ok) {
    throw new Error(payload.message ?? "API request failed.");
  }
  return payload as T;
}

export function weekQuery(leagueId: string, seasonId = appConfig.seasonId, weekId = appConfig.weekId): string {
  return `leagueId=${encodeURIComponent(leagueId)}&seasonId=${encodeURIComponent(seasonId)}&weekId=${encodeURIComponent(weekId)}`;
}
