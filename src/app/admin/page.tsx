"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import {
  apiGet,
  apiSend,
  AppLeague,
  GameWithOptions,
  LeagueMember,
  PickClaim,
  PlayerPick,
  ScrapeRun,
  Week,
  weekQuery
} from "../../lib/api";

export default function AdminPage() {
  const [leagues, setLeagues] = useState<AppLeague[]>([]);
  const [activeLeagueId, setActiveLeagueId] = useState("");
  const [week, setWeek] = useState<Week>();
  const [games, setGames] = useState<GameWithOptions[]>([]);
  const [picks, setPicks] = useState<PlayerPick[]>([]);
  const [claims, setClaims] = useState<PickClaim[]>([]);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [scrapeRuns, setScrapeRuns] = useState<ScrapeRun[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [newLeagueName, setNewLeagueName] = useState("");
  const [status, setStatus] = useState("Loading admin board...");

  useEffect(() => {
    apiGet<{ leagues: AppLeague[] }>("/leagues")
      .then((payload) => {
        setLeagues(payload.leagues);
        setActiveLeagueId(payload.leagues[0]?.leagueId ?? "");
        if (!payload.leagues.length) {
          setStatus("No leagues exist yet.");
        }
      })
      .catch((error: Error) => setStatus(error.message));
  }, []);

  useEffect(() => {
    if (activeLeagueId) {
      void load(activeLeagueId);
    }
  }, [activeLeagueId]);

  async function load(leagueId = activeLeagueId) {
    try {
      const payload = await apiGet<{
        week: Week;
        games: GameWithOptions[];
        claims: PickClaim[];
        picks: PlayerPick[];
        scrapeRuns: ScrapeRun[];
        members: LeagueMember[];
      }>(`/admin/week?${weekQuery(leagueId)}`);
      setWeek(payload.week);
      setGames(payload.games);
      setClaims(payload.claims);
      setPicks(payload.picks);
      setScrapeRuns(payload.scrapeRuns);
      setMembers(payload.members);
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load admin board.");
    }
  }

  async function saveSettings(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!week) {
      return;
    }
    const form = new FormData(event.currentTarget);
    try {
      const payload = await apiSend<{ week: Week }>("/admin/week/settings", "PUT", {
        leagueId: week.leagueId,
        seasonId: week.seasonId,
        weekId: week.weekId,
        nflPickCountRequired: Number(form.get("nflPickCountRequired")),
        ncaafPickCountRequired: Number(form.get("ncaafPickCountRequired"))
      });
      setWeek(payload.week);
      setStatus("Weekly quotas saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save quotas.");
    }
  }

  async function invitePlayer(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!activeLeagueId || !inviteEmail) {
      return;
    }
    try {
      await apiSend("/admin/invites", "POST", { leagueId: activeLeagueId, email: inviteEmail });
      setInviteEmail("");
      setStatus("Invite sent.");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send invite.");
    }
  }

  async function createLeague(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!newLeagueName) {
      return;
    }
    try {
      const payload = await apiSend<{ league: AppLeague }>("/admin/leagues", "POST", { name: newLeagueName });
      setLeagues((current) => [...current, payload.league]);
      setActiveLeagueId(payload.league.leagueId);
      setNewLeagueName("");
      setStatus("League created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create league.");
    }
  }

  async function updateMember(member: LeagueMember, role: "league_admin" | "player") {
    try {
      await apiSend(`/admin/leagues/${encodeURIComponent(member.leagueId)}/members`, "PUT", {
        userId: member.userId,
        email: member.email,
        role
      });
      setStatus("Member role saved.");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update member.");
    }
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-turf">Admin Portal</p>
            <h1 className="text-4xl font-semibold">League Control</h1>
            <p className="mt-2 text-ink/65">{week ? `${week.label} cutoff ${new Date(week.cutoffAt).toLocaleString()}` : "Manage league settings, invites, and weekly claims."}</p>
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

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded border border-ink/10 bg-white p-4">
            <h2 className="mb-3 font-semibold">Active League</h2>
            <select className="w-full rounded border border-ink/20 bg-white px-3 py-2" value={activeLeagueId} onChange={(event) => setActiveLeagueId(event.target.value)}>
              {leagues.map((league) => <option key={league.leagueId} value={league.leagueId}>{league.name}</option>)}
            </select>
          </div>
          <form className="rounded border border-ink/10 bg-white p-4" onSubmit={createLeague}>
            <h2 className="mb-3 font-semibold">Create League</h2>
            <div className="flex gap-2">
              <input className="min-w-0 flex-1 rounded border border-ink/20 px-3 py-2 text-sm" value={newLeagueName} onChange={(event) => setNewLeagueName(event.target.value)} placeholder="Family league" />
              <button className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white">Create</button>
            </div>
          </form>
          <form className="rounded border border-ink/10 bg-white p-4" onSubmit={invitePlayer}>
            <h2 className="mb-3 font-semibold">Invite Player</h2>
            <div className="flex gap-2">
              <input className="min-w-0 flex-1 rounded border border-ink/20 px-3 py-2 text-sm" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="friend@example.com" />
              <button className="rounded bg-turf px-4 py-2 text-sm font-semibold text-white">Invite</button>
            </div>
          </form>
        </div>

        {week ? (
          <form className="mb-6 rounded border border-ink/10 bg-white p-4" onSubmit={saveSettings}>
            <h2 className="mb-3 text-xl font-semibold">Weekly Quotas</h2>
            <div className="grid gap-3 md:grid-cols-[180px_180px_auto] md:items-end">
              <label className="text-sm font-semibold">
                NFL picks
                <input className="mt-1 w-full rounded border border-ink/20 px-3 py-2" name="nflPickCountRequired" type="number" min="0" max="20" defaultValue={week.nflPickCountRequired} />
              </label>
              <label className="text-sm font-semibold">
                CFB picks
                <input className="mt-1 w-full rounded border border-ink/20 px-3 py-2" name="ncaafPickCountRequired" type="number" min="0" max="20" defaultValue={week.ncaafPickCountRequired} />
              </label>
              <button className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white">Save Quotas</button>
            </div>
          </form>
        ) : null}

        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <section className="rounded border border-ink/10 bg-white p-4">
            <h2 className="mb-3 text-xl font-semibold">Members</h2>
            <div className="space-y-2">
              {members.map((member) => (
                <div key={member.userId} className="grid gap-2 rounded bg-ink/5 p-3 text-sm md:grid-cols-[1fr_150px] md:items-center">
                  <div>
                    <div className="font-semibold">{member.email ?? member.userId}</div>
                    <div className="text-ink/55">{member.userId}</div>
                  </div>
                  <select className="rounded border border-ink/20 bg-white px-3 py-2" value={member.role} onChange={(event) => updateMember(member, event.target.value as "league_admin" | "player")}>
                    <option value="player">Player</option>
                    <option value="league_admin">League admin</option>
                  </select>
                </div>
              ))}
              {!members.length ? <p className="text-sm text-ink/60">No members yet.</p> : null}
            </div>
          </section>

          <section className="rounded border border-ink/10 bg-white p-4">
            <h2 className="mb-3 text-xl font-semibold">Submitted Picks</h2>
            <div className="grid gap-2 text-sm">
              {picks.map((pick) => (
                <div key={`${pick.userId}-${pick.optionId}`} className="rounded bg-ink/5 p-3">
                  <div className="font-semibold">{pick.team}</div>
                  <div className="text-ink/60">{pick.sportLeague} · {pick.market === "spread" ? "spread" : "team total"} · {pick.side} {pick.lineValue} · {pick.result}</div>
                </div>
              ))}
              {!picks.length ? <p className="text-ink/60">No picks submitted yet.</p> : null}
            </div>
          </section>
        </div>

        <section className="rounded border border-ink/10 bg-white">
          <div className="grid grid-cols-[90px_1.2fr_1fr_110px] gap-3 border-b border-ink/10 bg-ink/5 px-4 py-3 text-sm font-semibold text-ink/70 max-lg:hidden">
            <span>Sport</span>
            <span>Game</span>
            <span>Options</span>
            <span>Claims</span>
          </div>
          {games.map((game) => (
            <article key={game.gameId} className="grid gap-3 border-b border-ink/10 px-4 py-4 last:border-b-0 lg:grid-cols-[90px_1.2fr_1fr_110px] lg:items-center">
              <span className="w-fit rounded bg-turf/10 px-2 py-1 text-xs font-bold text-turf">{game.sportLeague}</span>
              <div>
                <div className="font-semibold">{game.awayTeam} at {game.homeTeam}</div>
                <div className="text-sm text-ink/60">{new Date(game.kickoffAt).toLocaleString()}</div>
              </div>
              <div className="text-sm text-ink/70">{game.options.length} claimable options</div>
              <div className="text-sm font-semibold">{claims.filter((claim) => game.options.some((option) => option.optionId === claim.optionId)).length}</div>
            </article>
          ))}
        </section>
      </section>
    </AppShell>
  );
}
