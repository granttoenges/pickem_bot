"use client";

import type { AppLeague } from "./api";

const activeLeagueKey = "pickem.activeLeagueId";

export function getPreferredLeagueId(leagues: AppLeague[]): string {
  if (typeof window === "undefined") {
    return leagues[0]?.leagueId ?? "";
  }
  const stored = window.localStorage.getItem(activeLeagueKey);
  if (stored && leagues.some((league) => league.leagueId === stored)) {
    return stored;
  }
  return leagues[0]?.leagueId ?? "";
}

export function persistPreferredLeagueId(leagueId: string): void {
  if (typeof window === "undefined" || !leagueId) {
    return;
  }
  window.localStorage.setItem(activeLeagueKey, leagueId);
}
