"use client";

import { appConfig } from "./config";
import { getStoredSession } from "./auth";

export type Market = "spread" | "moneyline";
export type League = "NFL" | "NCAAF";

export interface OpeningLine {
  gameId: string;
  market: Market;
  source: "draftkings" | "admin_override";
  capturedAt: string;
  homeSpread?: number;
  awaySpread?: number;
  homeMoneyline?: number;
  awayMoneyline?: number;
}

export interface GameWithLines {
  gameId: string;
  seasonId: string;
  weekId: string;
  league: League;
  awayTeam: string;
  homeTeam: string;
  kickoffAt: string;
  status: "scheduled" | "final";
  isVisible?: boolean;
  pickMarket?: Market;
  adminNote?: string;
  overrideSource?: string;
  lines: OpeningLine[];
  userPick?: PlayerPick;
}

export interface Week {
  seasonId: string;
  weekId: string;
  label: string;
  cutoffAt: string;
  status: string;
}

export interface PlayerPick {
  seasonId: string;
  weekId: string;
  gameId: string;
  userId: string;
  market: Market;
  selectedTeam: string;
  submittedAt: string;
  result: string;
}

export interface ScrapeRun {
  capturedAt: string;
  status: string;
  parsedGameCount: number;
  errors: string[];
}

export interface Standing {
  userId: string;
  displayName: string;
  wins: number;
  losses: number;
  pushes: number;
}

export async function apiGet<T>(path: string): Promise<T> {
  return apiRequest<T>(path, { method: "GET" });
}

export async function apiSend<T>(path: string, method: "POST" | "PUT", body: unknown): Promise<T> {
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

export function weekQuery(): string {
  return `seasonId=${encodeURIComponent(appConfig.seasonId)}&weekId=${encodeURIComponent(appConfig.weekId)}`;
}
