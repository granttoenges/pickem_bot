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
  LineProposal,
  PickClaim,
  PickOption,
  ProposalResponse,
  ScrapeRun,
  Week,
  weekQuery
} from "../../lib/api";
import { appConfig } from "../../lib/config";
import { getStoredSession, SessionState } from "../../lib/auth";
import { getPreferredLeagueId, persistPreferredLeagueId } from "../../lib/leaguePreference";
import { isValidQuotaInput, parseQuotaInput } from "../../lib/quotaInput";

export default function AdminPage() {
  const [leagues, setLeagues] = useState<AppLeague[]>([]);
  const [activeLeagueId, setActiveLeagueId] = useState("");
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [activeSeasonId, setActiveSeasonId] = useState(appConfig.seasonId);
  const [activeWeekId, setActiveWeekId] = useState(appConfig.weekId);
  const [week, setWeek] = useState<Week>();
  const [games, setGames] = useState<GameWithOptions[]>([]);
  const [proposals, setProposals] = useState<LineProposal[]>([]);
  const [proposalResponses, setProposalResponses] = useState<ProposalResponse[]>([]);
  const [claims, setClaims] = useState<PickClaim[]>([]);
  const [members, setMembers] = useState<LeagueMember[]>([]);
  const [scrapeRuns, setScrapeRuns] = useState<ScrapeRun[]>([]);
  const [inviteEmail, setInviteEmail] = useState("");
  const [newLeagueName, setNewLeagueName] = useState("");
  const [nflQuota, setNflQuota] = useState("3");
  const [ncaafQuota, setNcaafQuota] = useState("3");
  const [pickMode, setPickMode] = useState<AppLeague["pickMode"]>("member_proposed");
  const [scrapeAtLocal, setScrapeAtLocal] = useState("");
  const [cutoffAtLocal, setCutoffAtLocal] = useState("");
  const [savingSettings, setSavingSettings] = useState(false);
  const [invitingPlayer, setInvitingPlayer] = useState(false);
  const [removingUserId, setRemovingUserId] = useState<string>();
  const [pendingBoardOptionId, setPendingBoardOptionId] = useState<string>();
  const [savingResultGameId, setSavingResultGameId] = useState<string>();
  const [scoreEdits, setScoreEdits] = useState<Record<string, { away: string; home: string }>>({});
  const [showCreateLeague, setShowCreateLeague] = useState(false);
  const [creatingLeague, setCreatingLeague] = useState(false);
  const [session, setSession] = useState<SessionState>();
  const [status, setStatus] = useState("Loading admin board...");

  useEffect(() => {
    setSession(getStoredSession());
  }, []);

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
      apiGet<{ weeks: Week[] }>(`/weeks?leagueId=${encodeURIComponent(activeLeagueId)}&seasonId=${encodeURIComponent(activeSeasonId)}`)
        .then((payload) => {
          setWeeks(payload.weeks);
          const preferred = payload.weeks.find((item) => item.weekId === activeWeekId) ?? payload.weeks[0];
          if (preferred) {
            setActiveSeasonId(preferred.seasonId);
            setActiveWeekId(preferred.weekId);
            void load(activeLeagueId, preferred.seasonId, preferred.weekId);
          } else {
            void load(activeLeagueId, activeSeasonId, activeWeekId);
          }
        })
        .catch(() => void load(activeLeagueId, activeSeasonId, activeWeekId));
    }
  }, [activeLeagueId]);

  useEffect(() => {
    if (activeLeagueId) {
      void load(activeLeagueId, activeSeasonId, activeWeekId);
    }
  }, [activeSeasonId, activeWeekId]);

  async function load(leagueId = activeLeagueId, seasonId = activeSeasonId, weekId = activeWeekId) {
    try {
      const payload = await apiGet<{
        league?: AppLeague;
        pickMode: AppLeague["pickMode"];
        week: Week;
        games: GameWithOptions[];
        claims: PickClaim[];
        proposals: LineProposal[];
        proposalResponses: ProposalResponse[];
        scrapeRuns: ScrapeRun[];
        members: LeagueMember[];
      }>(`/admin/week?${weekQuery(leagueId, seasonId, weekId)}`);
      setWeek(payload.week);
      setGames(payload.games);
      setClaims(payload.claims);
      setProposals(payload.proposals);
      setProposalResponses(payload.proposalResponses);
      setScrapeRuns(payload.scrapeRuns);
      setMembers(payload.members);
      setPickMode(payload.pickMode ?? payload.league?.pickMode ?? "member_proposed");
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
    if (pickMode !== "admin_selected" && (nflPickCountRequired === undefined || ncaafPickCountRequired === undefined)) {
      setStatus("Enter valid NFL and CFB quotas from 0 to 20.");
      return;
    }
    setSavingSettings(true);
    try {
      const leaguePayload = await apiSend<{ league: AppLeague }>(`/admin/leagues/${encodeURIComponent(week.leagueId)}/settings`, "PUT", {
        pickMode: pickMode ?? "member_proposed"
      });
      const payload = await apiSend<{ week: Week }>("/admin/week/settings", "PUT", {
        leagueId: week.leagueId,
        seasonId: week.seasonId,
        weekId: week.weekId,
        nflPickCountRequired: nflPickCountRequired ?? week.nflPickCountRequired,
        ncaafPickCountRequired: ncaafPickCountRequired ?? week.ncaafPickCountRequired,
        scrapeAt: scrapeAtLocal ? fromDatetimeLocal(scrapeAtLocal) : undefined,
        cutoffAt: fromDatetimeLocal(cutoffAtLocal)
      });
      setLeagues((current) => current.map((league) => league.leagueId === leaguePayload.league.leagueId ? leaguePayload.league : league));
      setWeek(payload.week);
      setPickMode(leaguePayload.league.pickMode ?? "member_proposed");
      setNflQuota(String(payload.week.nflPickCountRequired));
      setNcaafQuota(String(payload.week.ncaafPickCountRequired));
      setScrapeAtLocal(toDatetimeLocal(payload.week.scrapeAt));
      setCutoffAtLocal(toDatetimeLocal(payload.week.cutoffAt));
      setStatus("League and weekly settings saved.");
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
    setInvitingPlayer(true);
    try {
      await apiSend("/admin/invites", "POST", { leagueId: activeLeagueId, email: inviteEmail });
      setInviteEmail("");
      setStatus("Invite sent.");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not send invite.");
    } finally {
      setInvitingPlayer(false);
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

  async function removeMember(member: LeagueMember) {
    const label = member.email ?? member.userId;
    if (!window.confirm(`Remove ${label} from this league? This deletes their league picks, proposals, responses, and standings history.`)) {
      return;
    }
    setRemovingUserId(member.userId);
    try {
      const payload = await apiSend<{ cognitoDeleted?: boolean }>(`/admin/leagues/${encodeURIComponent(member.leagueId)}/members`, "DELETE", {
        userId: member.userId
      });
      setStatus(payload.cognitoDeleted ? "Member removed and login reset for future invite." : "Member removed from league.");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove member.");
    } finally {
      setRemovingUserId(undefined);
    }
  }

  async function toggleAdminBoardLine(option: PickOption) {
    if (!week || pickMode !== "admin_selected") {
      return;
    }
    const existing = proposals.find((proposal) => proposal.proposalSource === "admin_selected" && proposal.optionId === option.optionId);
    setPendingBoardOptionId(option.optionId);
    try {
      if (existing) {
        await apiSend("/admin/board-lines", "DELETE", {
          leagueId: week.leagueId,
          seasonId: week.seasonId,
          weekId: week.weekId,
          proposalId: existing.proposalId
        });
        setStatus("League board line removed.");
      } else {
        await apiSend("/admin/board-lines", "PUT", {
          leagueId: week.leagueId,
          seasonId: week.seasonId,
          weekId: week.weekId,
          optionId: option.optionId
        });
        setStatus("League board line added.");
      }
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update league board line.");
    } finally {
      setPendingBoardOptionId(undefined);
    }
  }

  async function saveResult(game: GameWithOptions) {
    if (!week) {
      return;
    }
    const scores = scoreEdits[game.gameId] ?? { away: String(game.awayScore ?? ""), home: String(game.homeScore ?? "") };
    const awayScore = Number(scores.away);
    const homeScore = Number(scores.home);
    if (!Number.isInteger(awayScore) || !Number.isInteger(homeScore) || awayScore < 0 || homeScore < 0) {
      setStatus("Enter valid non-negative final scores.");
      return;
    }
    setSavingResultGameId(game.gameId);
    try {
      await apiSend("/admin/results", "PUT", {
        leagueId: week.leagueId,
        seasonId: week.seasonId,
        weekId: week.weekId,
        gameId: game.gameId,
        awayScore,
        homeScore
      });
      setStatus("Final score saved. Results sync will grade standings from stored opening lines.");
      await load();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save final score.");
    } finally {
      setSavingResultGameId(undefined);
    }
  }

  return (
    <AppShell>
      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="mb-6 grid gap-4 lg:grid-cols-[1fr_360px]">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-turf">Admin Portal</p>
            <h1 className="text-4xl font-semibold">League Control</h1>
            <p className="mt-2 text-ink/65 dark:text-zinc-400">{week ? `${week.label} · DraftKings ${formatDateTime(week.scrapeAt)} · Picks close ${formatDateTime(week.cutoffAt)}` : "Manage league settings, invites, and weekly proposed lines."}</p>
          </div>
          <div className="rounded border border-ink/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="mb-2 font-semibold">Scraper Status</h2>
            {week ? <div className="mb-2 text-sm text-ink/70 dark:text-zinc-300">Configured status: <strong>{week.scrapeStatus ?? "pending"}</strong></div> : null}
            {scrapeRuns[0] ? (
              <div className="text-sm text-ink/70 dark:text-zinc-300">
                <div>Status: <strong>{scrapeRuns[0].status}</strong></div>
                <div>Games parsed: <strong>{scrapeRuns[0].parsedGameCount}</strong></div>
                <div>Captured: {new Date(scrapeRuns[0].capturedAt).toLocaleString()}</div>
              </div>
            ) : <p className="text-sm text-ink/60 dark:text-zinc-400">No scrape runs stored yet.</p>}
          </div>
        </div>

        {status ? <div className="mb-4 rounded border border-ink/10 bg-white p-3 text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200">{status}</div> : null}

        <div className="mb-6 grid gap-4 lg:grid-cols-3">
          <div className="rounded border border-ink/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="mb-3 font-semibold">Active League</h2>
            <select
              className="w-full rounded border border-ink/20 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
              value={activeLeagueId}
              onChange={(event) => {
                setActiveLeagueId(event.target.value);
                persistPreferredLeagueId(event.target.value);
              }}
            >
              {leagues.map((league) => <option key={league.leagueId} value={league.leagueId}>{league.name}</option>)}
            </select>
            {weeks.length > 1 ? (
              <select
                className="mt-3 w-full rounded border border-ink/20 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
                value={`${activeSeasonId}#${activeWeekId}`}
                onChange={(event) => {
                  const [seasonId, weekId] = event.target.value.split("#");
                  setActiveSeasonId(seasonId);
                  setActiveWeekId(weekId);
                }}
              >
                {weeks.map((item) => <option key={`${item.seasonId}#${item.weekId}`} value={`${item.seasonId}#${item.weekId}`}>{item.seasonId} Week {item.weekId}</option>)}
              </select>
            ) : null}
          </div>
          <div className="rounded border border-ink/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="mb-3 font-semibold">League Actions</h2>
            <button className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white dark:bg-zinc-100 dark:text-zinc-950" onClick={() => setShowCreateLeague(true)}>
              Create League
            </button>
          </div>
          <form className="rounded border border-ink/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900" onSubmit={invitePlayer}>
            <h2 className="mb-3 font-semibold">Invite Player</h2>
            <div className="flex gap-2">
              <input className="min-w-0 flex-1 rounded border border-ink/20 px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100" type="email" value={inviteEmail} onChange={(event) => setInviteEmail(event.target.value)} placeholder="friend@example.com" />
              <button className="rounded bg-turf px-4 py-2 text-sm font-semibold text-white disabled:bg-turf/50" disabled={invitingPlayer}>
                {invitingPlayer ? "Sending..." : "Invite"}
              </button>
            </div>
          </form>
        </div>

        {week ? (
          <form className="mb-6 rounded border border-ink/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900" onSubmit={saveSettings}>
            <h2 className="mb-3 text-xl font-semibold">Weekly Settings</h2>
            <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-[220px_160px_160px_240px_240px_auto] lg:items-end">
              <label className="text-sm font-semibold">
                League pick mode
                <select
                  className="mt-1 w-full rounded border border-ink/20 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
                  disabled={savingSettings}
                  value={pickMode ?? "member_proposed"}
                  onChange={(event) => setPickMode(event.target.value as AppLeague["pickMode"])}
                >
                  <option value="member_proposed">Members propose lines</option>
                  <option value="admin_selected">Admin selects lines</option>
                </select>
              </label>
              {pickMode === "admin_selected" ? (
                <div className="rounded border border-ink/10 bg-ink/5 px-3 py-2 text-sm text-ink/65 md:col-span-2 dark:border-white/10 dark:bg-white/5 dark:text-zinc-400">
                  Proposal limits are not used in admin-selected mode.
                </div>
              ) : (
                <>
                  <label className="text-sm font-semibold">
                    NFL lines per member
                    <input
                      className="mt-1 w-full rounded border border-ink/20 px-3 py-2 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
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
                    CFB lines per member
                    <input
                      className="mt-1 w-full rounded border border-ink/20 px-3 py-2 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
                      disabled={savingSettings}
                      name="ncaafPickCountRequired"
                      type="number"
                      min="0"
                      max="20"
                      value={ncaafQuota}
                      onChange={(event) => setNcaafQuota(event.target.value)}
                    />
                  </label>
                </>
              )}
              <label className="text-sm font-semibold">
                DraftKings capture
                <input
                  className="mt-1 w-full rounded border border-ink/20 px-3 py-2 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
                  disabled={savingSettings}
                  type="datetime-local"
                  value={scrapeAtLocal}
                  onChange={(event) => setScrapeAtLocal(event.target.value)}
                />
              </label>
              <label className="text-sm font-semibold">
                Pick cutoff
                <input
                  className="mt-1 w-full rounded border border-ink/20 px-3 py-2 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
                  disabled={savingSettings}
                  required
                  type="datetime-local"
                  value={cutoffAtLocal}
                  onChange={(event) => setCutoffAtLocal(event.target.value)}
                />
              </label>
              <button className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white disabled:bg-ink/35 dark:bg-zinc-100 dark:text-zinc-950 dark:disabled:bg-white/20 dark:disabled:text-zinc-500" disabled={savingSettings || (pickMode !== "admin_selected" && (!isValidQuotaInput(nflQuota) || !isValidQuotaInput(ncaafQuota)))}>
                {savingSettings ? "Saving..." : "Save Settings"}
              </button>
            </div>
          </form>
        ) : null}

        <div className="mb-6 grid gap-4 lg:grid-cols-2">
          <section className="rounded border border-ink/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="mb-3 text-xl font-semibold">Members</h2>
            <div className="space-y-2">
              {members.map((member) => (
                <div key={member.userId} className="grid gap-2 rounded bg-ink/5 p-3 text-sm md:grid-cols-[1fr_150px_96px] md:items-center dark:bg-white/5">
                  <div>
                    <div className="font-semibold">{member.email ?? member.userId}</div>
                    <div className="text-ink/55 dark:text-zinc-500">{member.userId}</div>
                  </div>
                  <select className="rounded border border-ink/20 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100" value={member.role} onChange={(event) => updateMember(member, event.target.value as "league_admin" | "player")}>
                    <option value="player">Player</option>
                    <option value="league_admin">League admin</option>
                  </select>
                  {canShowRemoveMember(member, session) ? (
                    <button className="rounded border border-red-200 bg-white px-3 py-2 font-semibold text-red-700 hover:bg-red-50 disabled:text-red-300 dark:border-red-400/30 dark:bg-zinc-900 dark:text-red-300 dark:hover:bg-red-400/10 dark:disabled:text-red-900" disabled={removingUserId === member.userId} onClick={() => removeMember(member)}>
                      {removingUserId === member.userId ? "Removing..." : "Remove"}
                    </button>
                  ) : (
                    <span className="hidden md:block" />
                  )}
                </div>
              ))}
              {!members.length ? <p className="text-sm text-ink/60 dark:text-zinc-400">No members yet.</p> : null}
            </div>
          </section>

          <section className="rounded border border-ink/10 bg-white p-4 dark:border-white/10 dark:bg-zinc-900">
            <h2 className="mb-3 text-xl font-semibold">Proposed Lines</h2>
            <div className="grid gap-2 text-sm">
              {proposals.map((proposal) => (
                <div key={proposal.proposalId} className="rounded bg-ink/5 p-3 dark:bg-white/5">
                  <div className="font-semibold">{proposal.team}</div>
                  <div className="text-ink/60 dark:text-zinc-400">{proposal.sportLeague} · {formatMarketName(proposal.market)} · {proposal.side} {proposal.lineValue} · proposed by {proposal.proposerLabel ?? proposal.proposerId} · {proposal.result}</div>
                </div>
              ))}
              {!proposals.length ? <p className="text-ink/60 dark:text-zinc-400">No lines proposed yet.</p> : null}
            </div>
          </section>
        </div>

        <section className="space-y-3">
          {games.map((game) => (
            <div key={game.gameId}>
              <GameOddsBoard
                game={game}
                claims={claims}
                mode={pickMode === "admin_selected" ? "admin_select" : "summary"}
                userOptionIds={new Set(proposals.filter((proposal) => proposal.proposalSource === "admin_selected").map((proposal) => proposal.optionId))}
                locked={!week || new Date() >= new Date(week.cutoffAt)}
                onPick={pickMode === "admin_selected" ? toggleAdminBoardLine : undefined}
                pendingOptionId={pendingBoardOptionId}
              />
              <div className="rounded-b border-x border-b border-ink/15 bg-white px-4 py-2 text-sm text-ink/60 shadow-sm ring-1 ring-ink/5 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-400 dark:ring-white/5">
                <div>{game.options.length} available options · {proposals.filter((proposal) => proposal.gameId === game.gameId && proposal.proposalSource === "admin_selected").length} league board lines · {proposals.filter((proposal) => proposal.gameId === game.gameId && proposal.proposalSource !== "admin_selected").length} member proposed · {proposalResponses.filter((response) => proposals.some((proposal) => proposal.gameId === game.gameId && proposal.proposalId === response.proposalId)).length} responses</div>
                <div className="mt-2 flex flex-wrap items-center gap-2">
                  <span className="font-semibold text-ink/70 dark:text-zinc-300">Final score</span>
                  <label className="text-xs">
                    {game.awayTeam}
                    <input
                      className="ml-1 w-16 rounded border border-ink/15 bg-white px-2 py-1 dark:border-white/15 dark:bg-zinc-950"
                      inputMode="numeric"
                      value={scoreEdits[game.gameId]?.away ?? String(game.awayScore ?? "")}
                      onChange={(event) => setScoreEdits((current) => ({ ...current, [game.gameId]: { away: event.target.value, home: current[game.gameId]?.home ?? String(game.homeScore ?? "") } }))}
                    />
                  </label>
                  <label className="text-xs">
                    {game.homeTeam}
                    <input
                      className="ml-1 w-16 rounded border border-ink/15 bg-white px-2 py-1 dark:border-white/15 dark:bg-zinc-950"
                      inputMode="numeric"
                      value={scoreEdits[game.gameId]?.home ?? String(game.homeScore ?? "")}
                      onChange={(event) => setScoreEdits((current) => ({ ...current, [game.gameId]: { away: current[game.gameId]?.away ?? String(game.awayScore ?? ""), home: event.target.value } }))}
                    />
                  </label>
                  <button className="rounded border border-ink/15 px-3 py-1 text-xs font-semibold disabled:text-ink/30 dark:border-white/15 dark:disabled:text-zinc-600" disabled={savingResultGameId === game.gameId} onClick={() => saveResult(game)}>
                    {savingResultGameId === game.gameId ? "Saving..." : "Save Final"}
                  </button>
                  {game.status === "final" ? <span className="text-xs font-semibold text-turf">Final</span> : null}
                </div>
              </div>
            </div>
          ))}
        </section>
      </section>
      {showCreateLeague ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-ink/50 px-5 dark:bg-black/70">
          <form className="w-full max-w-md rounded border border-ink/10 bg-white p-5 shadow-xl dark:border-white/10 dark:bg-zinc-900" onSubmit={createLeague}>
            <div className="mb-4 flex items-center justify-between gap-3">
              <h2 className="text-xl font-semibold">Create League</h2>
              <button className="rounded px-2 py-1 text-ink/60 hover:bg-ink/5 dark:text-zinc-400 dark:hover:bg-white/10" type="button" onClick={() => setShowCreateLeague(false)}>
                Close
              </button>
            </div>
            <label className="text-sm font-semibold">
              League name
              <input
                autoFocus
                className="mt-1 w-full rounded border border-ink/20 px-3 py-2 dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100"
                disabled={creatingLeague}
                value={newLeagueName}
                onChange={(event) => setNewLeagueName(event.target.value)}
                placeholder="Family league"
              />
            </label>
            <div className="mt-5 flex justify-end gap-2">
              <button className="rounded border border-ink/20 px-4 py-2 text-sm font-semibold dark:border-white/15" disabled={creatingLeague} type="button" onClick={() => setShowCreateLeague(false)}>
                Cancel
              </button>
              <button className="rounded bg-ink px-4 py-2 text-sm font-semibold text-white disabled:bg-ink/35 dark:bg-zinc-100 dark:text-zinc-950 dark:disabled:bg-white/20 dark:disabled:text-zinc-500" disabled={creatingLeague || !newLeagueName.trim()}>
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

function formatMarketName(market: LineProposal["market"]): string {
  if (market === "spread") {
    return "spread";
  }
  if (market === "game_total") {
    return "game total";
  }
  return "team total";
}

function canShowRemoveMember(member: LeagueMember, session?: SessionState): boolean {
  if (!session) {
    return false;
  }
  const isSelf = member.email?.toLowerCase() === session.email.toLowerCase();
  if (isSelf) {
    return false;
  }
  const isSuperAdmin = session.email.toLowerCase() === "grantoenges@gmail.com" || session.groups.includes("super_admin");
  if (isSuperAdmin) {
    return true;
  }
  return member.role === "player";
}
