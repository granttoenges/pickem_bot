"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { LineText } from "../../components/LineText";
import { apiGet, apiSend, GameWithLines, PlayerPick, ScrapeRun, Week, weekQuery } from "../../lib/api";

export default function AdminPage() {
  const [week, setWeek] = useState<Week>();
  const [games, setGames] = useState<GameWithLines[]>([]);
  const [picks, setPicks] = useState<PlayerPick[]>([]);
  const [scrapeRuns, setScrapeRuns] = useState<ScrapeRun[]>([]);
  const [status, setStatus] = useState("Loading admin board...");

  async function load() {
    try {
      const payload = await apiGet<{ week: Week; games: GameWithLines[]; picks: PlayerPick[]; scrapeRuns: ScrapeRun[] }>(`/admin/week?${weekQuery()}`);
      setWeek(payload.week);
      setGames(payload.games);
      setPicks(payload.picks);
      setScrapeRuns(payload.scrapeRuns);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load admin board.");
    }
  }

  useEffect(() => {
    void load();
  }, []);

  async function updateGame(game: GameWithLines, patch: Partial<GameWithLines>) {
    const next = { ...game, ...patch };
    setGames((current) => current.map((item) => item.gameId === game.gameId ? next : item));
    try {
      await apiSend("/admin/games", "PUT", {
        seasonId: next.seasonId,
        weekId: next.weekId,
        gameId: next.gameId,
        isVisible: Boolean(next.isVisible),
        pickMarket: next.pickMarket ?? "spread",
        adminNote: next.adminNote
      });
      setStatus("Admin selection saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save game.");
    }
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-turf">Admin Portal</p>
            <h1 className="text-4xl font-semibold">Weekly Game Control</h1>
            <p className="mt-2 text-ink/65">{week ? `${week.label} cutoff ${new Date(week.cutoffAt).toLocaleString()}` : "Review scraped NFL and college games."}</p>
          </div>
          <div className="rounded border border-ink/10 bg-white p-4">
            <h2 className="mb-2 font-semibold">Scraper Status</h2>
            {scrapeRuns[0] ? (
              <div className="text-sm text-ink/70">
                <div>Status: <strong>{scrapeRuns[0].status}</strong></div>
                <div>Games parsed: <strong>{scrapeRuns[0].parsedGameCount}</strong></div>
                <div>Captured: {new Date(scrapeRuns[0].capturedAt).toLocaleString()}</div>
              </div>
            ) : <p className="text-sm text-ink/60">No scrape runs stored yet.</p>}
          </div>
        </div>

        {status ? <div className="mb-4 rounded border border-ink/10 bg-white p-3 text-sm">{status}</div> : null}

        <div className="overflow-hidden rounded border border-ink/10 bg-white">
          <div className="grid grid-cols-[80px_1.4fr_1.2fr_130px_130px_1fr] gap-3 border-b border-ink/10 bg-ink/5 px-4 py-3 text-sm font-semibold text-ink/70 max-lg:hidden">
            <span>League</span>
            <span>Game</span>
            <span>Lines</span>
            <span>Visible</span>
            <span>Market</span>
            <span>Note</span>
          </div>
          {games.map((game) => (
            <article key={game.gameId} className="grid gap-3 border-b border-ink/10 px-4 py-4 last:border-b-0 lg:grid-cols-[80px_1.4fr_1.2fr_130px_130px_1fr] lg:items-center">
              <span className="w-fit rounded bg-turf/10 px-2 py-1 text-xs font-bold text-turf">{game.league}</span>
              <div>
                <div className="font-semibold">{game.awayTeam} at {game.homeTeam}</div>
                <div className="text-sm text-ink/60">{new Date(game.kickoffAt).toLocaleString()}</div>
              </div>
              <div className="text-sm">
                <div><LineText game={game} market="spread" /></div>
                <div className="text-ink/60"><LineText game={game} market="moneyline" /></div>
              </div>
              <label className="flex items-center gap-2 text-sm">
                <input
                  type="checkbox"
                  checked={Boolean(game.isVisible)}
                  onChange={(event) => updateGame(game, { isVisible: event.target.checked })}
                />
                Show
              </label>
              <select
                className="rounded border border-ink/20 px-3 py-2 text-sm"
                value={game.pickMarket ?? "spread"}
                onChange={(event) => updateGame(game, { pickMarket: event.target.value as "spread" | "moneyline" })}
              >
                <option value="spread">Spread</option>
                <option value="moneyline">Moneyline</option>
              </select>
              <input
                className="rounded border border-ink/20 px-3 py-2 text-sm"
                value={game.adminNote ?? ""}
                onChange={(event) => setGames((current) => current.map((item) => item.gameId === game.gameId ? { ...item, adminNote: event.target.value } : item))}
                onBlur={(event) => updateGame(game, { adminNote: event.target.value })}
                placeholder="Optional note"
              />
            </article>
          ))}
        </div>

        <section className="mt-6 rounded border border-ink/10 bg-white p-4">
          <h2 className="mb-3 text-xl font-semibold">Submitted Picks</h2>
          <div className="grid gap-2 text-sm md:grid-cols-2 lg:grid-cols-3">
            {picks.map((pick) => (
              <div key={`${pick.userId}-${pick.gameId}`} className="rounded bg-ink/5 p-3">
                <div className="font-semibold">{pick.selectedTeam}</div>
                <div className="text-ink/60">{pick.market} · {pick.result}</div>
              </div>
            ))}
            {!picks.length ? <p className="text-ink/60">No picks submitted yet.</p> : null}
          </div>
        </section>
      </section>
    </AppShell>
  );
}
