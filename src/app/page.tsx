"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { LineText } from "../components/LineText";
import { apiGet, apiSend, GameWithLines, Week, weekQuery } from "../lib/api";

export default function PlayerBoardPage() {
  const [week, setWeek] = useState<Week>();
  const [games, setGames] = useState<GameWithLines[]>([]);
  const [selected, setSelected] = useState<Record<string, string>>({});
  const [status, setStatus] = useState("Loading weekly board...");

  const locked = useMemo(() => week ? new Date() >= new Date(week.cutoffAt) : false, [week]);

  useEffect(() => {
    apiGet<{ week: Week; games: GameWithLines[] }>(`/week?${weekQuery()}`)
      .then((payload) => {
        setWeek(payload.week);
        setGames(payload.games);
        setStatus("");
      })
      .catch((error: Error) => setStatus(error.message));
  }, []);

  async function submitPick(game: GameWithLines) {
    const selectedTeam = selected[game.gameId];
    if (!selectedTeam || !game.pickMarket) {
      setStatus("Choose a team before submitting.");
      return;
    }
    try {
      await apiSend("/picks", "PUT", {
        seasonId: game.seasonId,
        weekId: game.weekId,
        gameId: game.gameId,
        market: game.pickMarket,
        selectedTeam
      });
      setStatus(`Pick saved for ${game.awayTeam} at ${game.homeTeam}.`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save pick.");
    }
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-turf">Player Portal</p>
            <h1 className="text-4xl font-semibold">Weekly Picks</h1>
            <p className="mt-2 text-ink/65">{week ? `${week.label} locks ${new Date(week.cutoffAt).toLocaleString()}` : "Visible admin-selected games only."}</p>
          </div>
          <span className={`rounded px-3 py-2 text-sm font-semibold ${locked ? "bg-red-100 text-red-800" : "bg-turf text-white"}`}>
            {locked ? "Picks Locked" : "Picks Open"}
          </span>
        </div>

        {status ? <div className="mb-4 rounded border border-ink/10 bg-white p-3 text-sm">{status}</div> : null}

        <div className="space-y-3">
          {games.map((game) => (
            <article key={game.gameId} className="rounded border border-ink/10 bg-white p-4">
              <div className="grid gap-4 lg:grid-cols-[90px_1fr_260px_180px] lg:items-center">
                <span className="w-fit rounded bg-turf/10 px-2 py-1 text-xs font-bold text-turf">{game.league}</span>
                <div>
                  <h2 className="text-lg font-semibold">{game.awayTeam} at {game.homeTeam}</h2>
                  <p className="text-sm text-ink/60">{new Date(game.kickoffAt).toLocaleString()}</p>
                  <p className="mt-1 text-sm font-medium"><LineText game={game} market={game.pickMarket ?? "spread"} /></p>
                </div>
                <select
                  className="rounded border border-ink/20 bg-white px-3 py-2"
                  value={selected[game.gameId] ?? game.userPick?.selectedTeam ?? ""}
                  onChange={(event) => setSelected((current) => ({ ...current, [game.gameId]: event.target.value }))}
                  disabled={locked}
                >
                  <option value="">Choose team</option>
                  <option value={game.awayTeam}>{game.awayTeam}</option>
                  <option value={game.homeTeam}>{game.homeTeam}</option>
                </select>
                <button
                  className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-ink/35"
                  disabled={locked}
                  onClick={() => submitPick(game)}
                >
                  Save Pick
                </button>
              </div>
            </article>
          ))}
          {!games.length && !status ? <div className="rounded border border-ink/10 bg-white p-6">No games have been selected by the admin yet.</div> : null}
        </div>
      </section>
    </AppShell>
  );
}
