"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { GameOddsBoard } from "../components/GameOddsBoard";
import { apiGet, apiSend, AppLeague, GameWithOptions, PickClaim, PickOption, PickSummary, PlayerPick, Week, weekQuery } from "../lib/api";
import { getPreferredLeagueId, persistPreferredLeagueId } from "../lib/leaguePreference";

type Tab = "available" | "mine";

export default function PlayerBoardPage() {
  const [leagues, setLeagues] = useState<AppLeague[]>([]);
  const [activeLeagueId, setActiveLeagueId] = useState("");
  const [week, setWeek] = useState<Week>();
  const [games, setGames] = useState<GameWithOptions[]>([]);
  const [claims, setClaims] = useState<PickClaim[]>([]);
  const [userPicks, setUserPicks] = useState<PlayerPick[]>([]);
  const [summary, setSummary] = useState<PickSummary>();
  const [tab, setTab] = useState<Tab>("available");
  const [replaceOptionId, setReplaceOptionId] = useState<string>();
  const [status, setStatus] = useState("Loading leagues...");

  const locked = useMemo(() => week ? new Date() >= new Date(week.cutoffAt) : false, [week]);

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
    void loadWeek(activeLeagueId);
  }, [activeLeagueId]);

  async function loadWeek(leagueId = activeLeagueId) {
    try {
      const payload = await apiGet<{
        week: Week;
        games: GameWithOptions[];
        claims: PickClaim[];
        userPicks: PlayerPick[];
        summary: PickSummary;
      }>(`/week?${weekQuery(leagueId)}`);
      setWeek(payload.week);
      setGames(payload.games);
      setClaims(payload.claims);
      setUserPicks(payload.userPicks);
      setSummary(payload.summary);
      setStatus("");
      setReplaceOptionId(undefined);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load weekly board.");
    }
  }

  async function claimOption(option: PickOption) {
    if (locked) {
      return;
    }
    const currentPick = userPicks.find((pick) => pick.optionId === option.optionId);
    if (currentPick) {
      await releasePick(currentPick.optionId);
      return;
    }
    const sameSportCount = userPicks.filter((pick) => pick.sportLeague === option.sportLeague && pick.optionId !== replaceOptionId).length;
    const required = option.sportLeague === "NFL" ? week?.nflPickCountRequired : week?.ncaafPickCountRequired;
    if (!replaceOptionId && required !== undefined && sameSportCount >= required) {
      setStatus(`Your ${option.sportLeague} card is full. Choose a pick from My Picks to change first.`);
      setTab("mine");
      return;
    }
    try {
      await apiSend("/picks", "PUT", {
        leagueId: option.leagueId,
        seasonId: option.seasonId,
        weekId: option.weekId,
        optionId: option.optionId,
        previousOptionId: replaceOptionId
      });
      setStatus(`Saved ${option.label}.`);
      await loadWeek();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not claim pick.");
    }
  }

  async function releasePick(optionId: string) {
    if (!week || locked) {
      return;
    }
    try {
      await apiSend("/picks", "DELETE", {
        leagueId: week.leagueId,
        seasonId: week.seasonId,
        weekId: week.weekId,
        optionId
      });
      setStatus("Pick released.");
      await loadWeek();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not release pick.");
    }
  }

  const userOptionIds = new Set(userPicks.map((pick) => pick.optionId));

  return (
    <AppShell>
      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-turf">Player Portal</p>
            <h1 className="text-4xl font-semibold">Weekly Pick Claims</h1>
            <p className="mt-2 text-ink/65">{week ? `${week.label} locks ${new Date(week.cutoffAt).toLocaleString()}` : "Claim exact spread and team total options."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            {leagues.length > 1 ? (
              <select
                className="rounded border border-ink/20 bg-white px-3 py-2"
                value={activeLeagueId}
                onChange={(event) => {
                  setActiveLeagueId(event.target.value);
                  persistPreferredLeagueId(event.target.value);
                }}
              >
                {leagues.map((league) => <option key={league.leagueId} value={league.leagueId}>{league.name}</option>)}
              </select>
            ) : null}
            <span className={`rounded px-3 py-2 text-sm font-semibold ${locked ? "bg-red-100 text-red-800" : "bg-turf text-white"}`}>
              {locked ? "Picks Locked" : "Picks Open"}
            </span>
          </div>
        </div>

        {summary ? (
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <Quota label="NFL" submitted={summary.NFL.submitted} required={summary.NFL.required} />
            <Quota label="CFB" submitted={summary.NCAAF.submitted} required={summary.NCAAF.required} />
            <div className={`rounded border p-4 ${summary.complete ? "border-turf bg-turf/10" : "border-ink/10 bg-white"}`}>
              <div className="text-sm font-semibold text-ink/60">Card Status</div>
              <div className="mt-1 text-xl font-semibold">{summary.complete ? "Complete" : "Incomplete"}</div>
            </div>
          </div>
        ) : null}

        {status ? <div className="mb-4 rounded border border-ink/10 bg-white p-3 text-sm">{status}</div> : null}

        <div className="mb-5 flex gap-2">
          <button className={tabClass(tab === "available")} onClick={() => setTab("available")}>Available Games</button>
          <button className={tabClass(tab === "mine")} onClick={() => setTab("mine")}>My Picks</button>
        </div>

        {tab === "available" ? (
          <div className="space-y-3">
            {games.map((game) => (
              <GameOddsBoard
                key={game.gameId}
                game={game}
                claims={claims}
                userOptionIds={userOptionIds}
                locked={locked}
                onPick={claimOption}
              />
            ))}
            {!games.length && !status ? <div className="rounded border border-ink/10 bg-white p-6">No games are available for this league week yet.</div> : null}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {userPicks.map((pick) => (
              <article key={pick.optionId} className={`rounded border bg-white p-4 ${replaceOptionId === pick.optionId ? "border-gold ring-2 ring-gold/30" : "border-ink/10"}`}>
                <div className="text-xs font-bold text-turf">{pick.sportLeague}</div>
                <h2 className="mt-1 font-semibold">{pick.team}</h2>
                <p className="text-sm text-ink/60">{pick.market === "spread" ? "Spread" : "Team total"} {pick.side} {pick.lineValue > 0 && pick.market === "spread" ? `+${pick.lineValue}` : pick.lineValue}</p>
                <p className="mt-2 text-sm font-medium">{pick.result}</p>
                <div className="mt-4 flex gap-2">
                  <button className="rounded bg-ink px-3 py-2 text-sm font-semibold text-white disabled:bg-ink/35" disabled={locked} onClick={() => { setReplaceOptionId(pick.optionId); setTab("available"); }}>
                    Change
                  </button>
                  <button className="rounded border border-ink/20 px-3 py-2 text-sm font-semibold disabled:text-ink/35" disabled={locked} onClick={() => releasePick(pick.optionId)}>
                    Release
                  </button>
                </div>
              </article>
            ))}
            {!userPicks.length ? <div className="rounded border border-ink/10 bg-white p-6 text-ink/60">You have not claimed any picks yet.</div> : null}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function Quota({ label, submitted, required }: { label: string; submitted: number; required: number }) {
  const complete = submitted === required;
  return (
    <div className={`rounded border p-4 ${complete ? "border-turf bg-turf/10" : "border-ink/10 bg-white"}`}>
      <div className="text-sm font-semibold text-ink/60">{label} Picks</div>
      <div className="mt-1 text-xl font-semibold">{submitted} / {required}</div>
    </div>
  );
}

function tabClass(active: boolean): string {
  return `rounded px-4 py-2 text-sm font-semibold ${active ? "bg-ink text-white" : "border border-ink/15 bg-white text-ink"}`;
}
