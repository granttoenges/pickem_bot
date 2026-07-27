"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { AuthGuard } from "../../components/AuthGuard";
import { apiGet, AppLeague, Standing } from "../../lib/api";
import { appConfig } from "../../lib/config";
import { getPreferredLeagueId, persistPreferredLeagueId } from "../../lib/leaguePreference";

export default function StandingsPage() {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [leagues, setLeagues] = useState<AppLeague[]>([]);
  const [activeLeagueId, setActiveLeagueId] = useState("");
  const [status, setStatus] = useState("Loading standings...");

  useEffect(() => {
    apiGet<{ leagues: AppLeague[] }>("/leagues")
      .then((payload) => {
        setLeagues(payload.leagues);
        setActiveLeagueId(getPreferredLeagueId(payload.leagues));
        if (!payload.leagues.length) {
          setStatus("You are not a member of a league yet.");
        }
      })
      .catch((error: Error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    if (!activeLeagueId) {
      return;
    }
    apiGet<{ standings: Standing[] }>(`/standings?leagueId=${encodeURIComponent(activeLeagueId)}&seasonId=${encodeURIComponent(appConfig.seasonId)}`)
      .then((payload) => {
        setStandings(payload.standings);
        setStatus("");
      })
      .catch((error: Error) => setStatus(error.message));
  }, [activeLeagueId]);

  return (
    <AuthGuard>
    <AppShell>
      <section className="mx-auto max-w-4xl px-5 py-8 md:px-8">
        <div className="flex flex-wrap items-end justify-between gap-4">
          <h1 className="text-4xl font-semibold">Season Standings</h1>
          {leagues.length > 1 ? (
            <select
              className="rounded border border-ink/20 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
              value={activeLeagueId}
              onChange={(event) => {
                setActiveLeagueId(event.target.value);
                persistPreferredLeagueId(event.target.value);
              }}
            >
              {leagues.map((league) => <option key={league.leagueId} value={league.leagueId}>{league.name}</option>)}
            </select>
          ) : null}
        </div>
        {status ? <div className="mt-4 rounded border border-ink/10 bg-white p-3 text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200">{status}</div> : null}
        <div className="mt-6 overflow-hidden rounded border border-ink/10 bg-white dark:border-white/10 dark:bg-zinc-900">
          {standings.length ? (
            <div className="grid grid-cols-[44px_1fr_70px_70px_70px_86px] border-b border-ink/10 bg-ink/5 px-4 py-2 text-xs font-bold uppercase tracking-wide text-ink/55 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
              <span>Rank</span>
              <span>Player</span>
              <span>Wins</span>
              <span>Losses</span>
              <span>Pushes</span>
              <span>Win %</span>
            </div>
          ) : null}
          {standings.map((row, index) => (
            <div key={row.userId} className="grid grid-cols-[44px_1fr_70px_70px_70px_86px] border-b border-ink/10 px-4 py-3 last:border-b-0 dark:border-white/10">
              <span className="font-semibold">{index + 1}</span>
              <span>{row.displayName}</span>
              <span>{row.wins}</span>
              <span>{row.losses}</span>
              <span>{row.pushes}</span>
              <span>{formatWinPercentage(row)}</span>
            </div>
          ))}
          {standings[0]?.lastUpdatedAt ? (
            <div className="border-t border-ink/10 px-4 py-2 text-xs text-ink/50 dark:border-white/10 dark:text-zinc-500">
              Last updated {new Date(standings[0].lastUpdatedAt).toLocaleString()}
            </div>
          ) : null}
          {!standings.length && !status ? <div className="p-6 text-ink/60 dark:text-zinc-400">Standings will appear after picks are graded.</div> : null}
        </div>
      </section>
    </AppShell>
    </AuthGuard>
  );
}

function formatWinPercentage(row: Standing): string {
  const decisions = row.wins + row.losses;
  const pct = row.winPercentage ?? (decisions ? row.wins / decisions : 0);
  return `${(pct * 100).toFixed(1)}%`;
}
