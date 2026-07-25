"use client";

import { FormEvent, useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { GameOddsBoard } from "../../components/GameOddsBoard";
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
import { getPreferredLeagueId, persistPreferredLeagueId } from "../../lib/leaguePreference";
import { isValidQuotaInput, parseQuotaInput } from "../../lib/quotaInput";

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
  const [nflQuota, setNflQuota] = useState("3");
  const [ncaafQuota, setNcaafQuota] = useState("3");
  const [scrapeAtLocal, setScrapeAtLocal] = useState("");
  const [cutoffAtLocal, setCutoffAtLocal] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [showCreateLeague, setShowCreateLeague] = useState(false);
  const [creatingLeague, setCreatingLeague] = useState(false);
  const [status, setStatus] = useState("Loading admin board...");

  useEffect(() => {
    apiGet<{ leagues: AppLeague[] }>("/leagues")
      .then((payload) => {
        setLeagues(payload.leagues);
        setActiveLeagueId(getPreferredLeagueId(payload.leagues));
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
      setNflQuota(String(payload.week.nflPickCountRequired));
      setNcaafQuota(String(payload.week.ncaafPickCountRequired));
      setScrapeAtLocal(toDatetimeLocal(payload.week.scrapeAt));
      setCutoffAtLocal(toDatetimeLocal(payload.week.cutoffAt));
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
    const nflPickCountRequired = parseQuotaInput(nflQuota);
    const ncaafPickCountRequired = parseQuotaInput(ncaafQuota);
    if (nflPickCountRequired === undefined || ncaafPickCountRequired === undefined) {
      setStatus("Enter valid NFL and CFB quotas from 0 to 20.");
      return;
    }
    setSavingSettings(true);
    try {
      const payload = await apiSend<{ week: Week }>("/admin/week/settings", "PUT", {
        leagueId: week.leagueId,
        seasonId: week.seasonId,
        weekId: week.weekId,
        nflPickCountRequired,
        ncaafPickCountRequired,
        scrapeAt: scrapeAtLocal ? fromDatetimeLocal(scrapeAtLocal) : undefined,
        cutoffAt: fromDatetimeLocal(cutoffAtLocal)
      });
      setWeek(payload.week);
      setNflQuota(String(payload.week.nflPickCountRequired));
      setNcaafQuota(String(payload.week.ncaafPickCountRequired));
      setScrapeAtLocal(toDatetimeLocal(payload.week.scrapeAt));
      setCutoffAtLocal(toDatetimeLocal(payload.week.cutoffAt));
      setStatus("Weekly quotas saved.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save quotas.");
    } finally {
      setSavingSettings(false);
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
    setCreatingLeague(true);
    try {
      const payload = await apiSend<{ league: AppLeague }>("/admin/leagues", "POST", { name: newLeagueName });
      setLeagues((current) => [...current, payload.league]);
      setActiveLeagueId(payload.league.leagueId);
      persistPreferredLeagueId(payload.league.leagueId);
      setNewLeagueName("");
      setShowCreateLeague(false);
      setStatus("League created.");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not create league.");
    } finally {
      setCreatingLeague(false);
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
            <p className="mt-2 text-ink/65">{week ? `${week.label} · DraftKings ${formatDateTime(week.scrapeAt)} · Picks close ${formatDateTime(week.cutoffAt)}` : "Manage league settings, invites, and weekly claims."}</p>
          </div>
          <div className="rounded border border-ink/10 bg-white p-4">
            <h2 className="mb-2 font-semibold">Scraper Status</h2>
            {week ? <div className="mb-2 text-sm text-ink/70">Configured status: <strong>{week.scrapeStatus ?? "pending"}</strong></div> : null}
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
            <select
              className="w-full rounded border border-ink/20 bg-white px-3 py-2"
              value={activeLeagueId}
              onChange={(event) => {
                setActiveLeagueId(event.target.value);
                persistPreferredLeagueId(event.target.value);
              }}
            >
              {leagues.map((league) => <option key={league.leagueId} value={league.leagueId}>{league.name}</option>)}
            </select>
          </div>
          <div className="rounded border border-ink/10 bg-white p-4">
            <h2 className="mb-3 font-semibold">League Actions</h2>
            <button className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white" onClick={() => setShowCreateLeague(true)}>
              Create League
            </button>
          </div>
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
            <h2 className="mb-3 text-xl font-semibold">Weekly Settings</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[160px_160px_240px_240px_auto] lg:items-end">
              <label className="text-sm font-semibold">
                NFL picks
                <input
                  className="mt-1 w-full rounded border border-ink/20 px-3 py-2"
                  disabled={savingSettings}
                  name="nflPickCountRequired"
                  type="number"
                  min="0"
                  max="20"
                  value={nflQuota}
                  onChange={(event) => setNflQuota(event.target.value)}
                />
              </label>
              <label className="text-sm font-semibold">
                CFB picks
                <input
                  className="mt-1 w-full rounded border border-ink/20 px-3 py-2"
                  disabled={savingSettings}
                  name="ncaafPickCountRequired"
                  type="number"
                  min="0"
                  max="20"
                  value={ncaafQuota}
                  onChange={(event) => setNcaafQuota(event.target.value)}
                />
              </label>
              <label className="text-sm font-semibold">
                DraftKings capture
                <input
                  className="mt-1 w-full rounded border border-ink/20 px-3 py-2"
                  disabled={savingSettings}
                  type="datetime-local"
                  value={scrapeAtLocal}
                  onChange={(event) => setScrapeAtLocal(event.target.value)}
                />
              </label>
              <label className="text-sm font-semibold">
                Pick cutoff
                <input
                  className="mt-1 w-full rounded border border-ink/20 px-3 py-2"
                  disabled={savingSettings}
                  required
                  type="datetime-local"
                  value={cutoffAtLocal}
                  onChange={(event) => setCutoffAtLocal(event.target.value)}
                />
              </label>
              <button className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white disabled:bg-ink/35" disabled={savingSettings || !isValidQuotaInput(nflQuota) || !isValidQuotaInput(ncaafQuota)}>
                {savingSettings ? "Saving..." : "Save Settings"}
              </button>
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

        <section className="space-y-3">
          {games.map((game) => (
            <div key={game.gameId}>
              <GameOddsBoard game={game} claims={claims} mode="summary" />
              <div className="rounded-b border-x border-b border-ink/10 bg-white px-4 py-2 text-sm text-ink/60">
                {game.options.length} claimable options · {claims.filter((claim) => game.options.some((option) => option.optionId === claim.optionId)).length} claimed
              </div>
            </div>
          ))}
        </section>
      </section>
      {showCreateLeague ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-5">
          <form className="w-full max-w-md rounded border border-ink/10 bg-white p-5 shadow-xl" onSubmit={createLeague}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Create League</h2>
              <button className="rounded px-2 py-1 text-ink/60 hover:bg-ink/5" type="button" onClick={() => setShowCreateLeague(false)}>
                Close
              </button>
            </div>
            <label className="text-sm font-semibold">
              League name
              <input
                autoFocus
                className="mt-1 w-full rounded border border-ink/20 px-3 py-2"
                disabled={creatingLeague}
                value={newLeagueName}
                onChange={(event) => setNewLeagueName(event.target.value)}
                placeholder="Family league"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded border border-ink/20 px-4 py-2 text-sm font-semibold" disabled={creatingLeague} type="button" onClick={() => setShowCreateLeague(false)}>
                Cancel
              </button>
              <button className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white disabled:bg-ink/35" disabled={creatingLeague || !newLeagueName.trim()}>
                {creatingLeague ? "Creating..." : "Create"}
              </button>
            </div>
          </form>
        </div>
      ) : null}
    </AppShell>
  );
}

function toDatetimeLocal(iso?: string): string {
  if (!iso) {
    return "";
  }
  const date = new Date(iso);
  const pad = (value: number) => String(value).padStart(2, "0");
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function fromDatetimeLocal(value: string): string {
  return new Date(value).toISOString();
}

function formatDateTime(iso?: string): string {
  return iso ? new Date(iso).toLocaleString() : "not set";
}
