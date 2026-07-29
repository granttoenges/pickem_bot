"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { AuthGuard } from "../../components/AuthGuard";
import { apiGet, AppLeague, Standing } from "../../lib/api";
import { appConfig } from "../../lib/config";
import { getPreferredLeagueId, persistPreferredLeagueId } from "../../lib/leaguePreference";
import { FadeContent, MagicCard, NumberTicker } from "../../components/ui/polish";

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
      <FadeContent className="mx-auto max-w-5xl px-5 py-8 md:px-8">
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
        {status ? <MagicCard className="mt-4 p-3 text-sm dark:text-zinc-200">{status}</MagicCard> : null}
        <MagicCard className="mt-6 overflow-hidden p-0">
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
            <div key={row.userId} className="grid grid-cols-[44px_1fr_70px_70px_70px_86px] border-b border-ink/10 px-4 py-3 transition hover:bg-turf/5 last:border-b-0 dark:border-white/10 dark:hover:bg-emerald-400/10">
              <span className="font-semibold text-turf dark:text-emerald-300">#{index + 1}</span>
              <span>{row.displayName}</span>
              <span><NumberTicker value={row.wins} /></span>
              <span><NumberTicker value={row.losses} /></span>
              <span><NumberTicker value={row.pushes} /></span>
              <span><NumberTicker value={winPercentageValue(row)} decimalPlaces={1} />%</span>
            </div>
          ))}
          {standings[0]?.lastUpdatedAt ? (
            <div className="border-t border-ink/10 px-4 py-2 text-xs text-ink/50 dark:border-white/10 dark:text-zinc-500">
              Last updated {new Date(standings[0].lastUpdatedAt).toLocaleString()}
            </div>
          ) : null}
          {!standings.length && !status ? <div className="p-6 text-ink/60 dark:text-zinc-400">Standings will appear after picks are graded.</div> : null}
        </MagicCard>
      </FadeContent>
    </AppShell>
    </AuthGuard>
  );
}

function winPercentageValue(row: Standing): number {
  const decisions = row.wins + row.losses;
  const pct = row.winPercentage ?? (decisions ? row.wins / decisions : 0);
  return pct * 100;
}
