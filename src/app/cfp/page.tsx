"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { AuthGuard } from "../../components/AuthGuard";
import { FadeContent, MagicCard, ShimmerButton } from "../../components/ui/polish";
import {
  apiGet,
  apiSend,
  AppLeague,
  CfpAssignment,
  CfpScrapeRun,
  CfpSeasonConfig,
  CfpTeamOdds,
  LeagueMember
} from "../../lib/api";
import { appConfig } from "../../lib/config";
import { getPreferredLeagueId, persistPreferredLeagueId } from "../../lib/leaguePreference";

interface CfpPayload {
  config: CfpSeasonConfig;
  canManage: boolean;
  assignments: CfpAssignment[];
  latestScrape?: CfpScrapeRun;
}

interface AdminCfpPayload {
  config: CfpSeasonConfig;
  assignments: CfpAssignment[];
  odds: CfpTeamOdds[];
  members: LeagueMember[];
  latestScrape?: CfpScrapeRun;
}

export default function CfpPage() {
  const [leagues, setLeagues] = useState<AppLeague[]>([]);
  const [activeLeagueId, setActiveLeagueId] = useState("");
  const [seasonId, setSeasonId] = useState(appConfig.seasonId);
  const [seasons, setSeasons] = useState<CfpSeasonConfig[]>([]);
  const [payload, setPayload] = useState<CfpPayload>();
  const [adminPayload, setAdminPayload] = useState<AdminCfpPayload>();
  const [teamInputs, setTeamInputs] = useState<Record<string, string>>({});
  const [oddsText, setOddsText] = useState("");
  const [pendingKey, setPendingKey] = useState<string>();
  const [status, setStatus] = useState("Loading CFP tracker...");

  useEffect(() => {
    apiGet<{ leagues: AppLeague[] }>("/leagues")
      .then((result) => {
        setLeagues(result.leagues);
        setActiveLeagueId(getPreferredLeagueId(result.leagues));
        if (!result.leagues.length) {
          setStatus("You are not a member of a league yet.");
        }
      })
      .catch((error: Error) => setStatus(error.message));
  }, []);

  const load = useCallback(async (leagueId: string, selectedSeason: string) => {
    if (!leagueId) return;
    try {
      const result = await apiGet<CfpPayload>(`/cfp?leagueId=${encodeURIComponent(leagueId)}&seasonId=${encodeURIComponent(selectedSeason)}`);
      setPayload(result);
      if (result.canManage) {
        setAdminPayload(await apiGet<AdminCfpPayload>(`/admin/cfp?leagueId=${encodeURIComponent(leagueId)}&seasonId=${encodeURIComponent(selectedSeason)}`));
      } else {
        setAdminPayload(undefined);
      }
      setStatus("");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load CFP tracker.");
    }
  }, []);

  useEffect(() => {
    if (!activeLeagueId) return;
    apiGet<{ seasons: CfpSeasonConfig[] }>(`/cfp/seasons?leagueId=${encodeURIComponent(activeLeagueId)}`)
      .then((result) => setSeasons(result.seasons))
      .catch(() => setSeasons([]));
    void load(activeLeagueId, seasonId);
  }, [activeLeagueId, seasonId, load]);

  const assignments = adminPayload?.assignments ?? payload?.assignments ?? [];
  const members = adminPayload?.members ?? [];
  const assignedKeys = useMemo(() => new Set(assignments.map((item) => item.teamKey)), [assignments]);
  const availableOdds = useMemo(
    () => (adminPayload?.odds ?? []).filter((item) => item.available && !assignedKeys.has(item.teamKey)),
    [adminPayload?.odds, assignedKeys]
  );

  async function setEnabled(enabled: boolean) {
    if (!activeLeagueId) return;
    setPendingKey("settings");
    try {
      await apiSend("/admin/cfp/settings", "PUT", { leagueId: activeLeagueId, seasonId, enabled });
      setStatus(enabled ? "CFP tracking enabled for this season." : "CFP tracking disabled; saved assignments were preserved.");
      await load(activeLeagueId, seasonId);
      const result = await apiGet<{ seasons: CfpSeasonConfig[] }>(`/cfp/seasons?leagueId=${encodeURIComponent(activeLeagueId)}`);
      setSeasons(result.seasons);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not update CFP settings.");
    } finally {
      setPendingKey(undefined);
    }
  }

  async function refreshOdds() {
    setPendingKey("refresh");
    try {
      await apiSend("/admin/cfp/refresh", "POST", { leagueId: activeLeagueId, seasonId });
      setStatus("CFP odds refresh started. The last successful prices remain available while it runs.");
      window.setTimeout(() => void load(activeLeagueId, seasonId), 5000);
      window.setTimeout(() => void load(activeLeagueId, seasonId), 12000);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not start CFP odds refresh.");
    } finally {
      setPendingKey(undefined);
    }
  }

  async function submitOddsList() {
    const trimmedOdds = oddsText.trim();
    if (!trimmedOdds) return;
    if (trimmedOdds.length > 50_000) {
      setStatus("CFP odds list must be smaller than 50 KB.");
      return;
    }
    setPendingKey("upload");
    try {
      const result = await apiSend<{ odds: CfpTeamOdds[] }>("/admin/cfp/odds", "PUT", {
        leagueId: activeLeagueId,
        seasonId,
        oddsText: trimmedOdds
      });
      setOddsText("");
      setStatus(`${result.odds.length} CFP team prices submitted for ${seasonId}. Existing picked odds were preserved.`);
      await load(activeLeagueId, seasonId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not submit CFP odds list.");
    } finally {
      setPendingKey(undefined);
    }
  }

  async function assignTeam(member: LeagueMember) {
    const requestedName = teamInputs[member.userId]?.trim().toLowerCase();
    const odds = availableOdds.find((item) => item.teamName.toLowerCase() === requestedName);
    if (!odds) {
      setStatus("Choose an available team from the dropdown.");
      return;
    }
    setPendingKey(`add:${member.userId}`);
    try {
      await apiSend("/admin/cfp/assignments", "PUT", {
        leagueId: activeLeagueId,
        seasonId,
        userId: member.userId,
        teamKey: odds.teamKey
      });
      setTeamInputs((current) => ({ ...current, [member.userId]: "" }));
      setStatus(`${odds.teamName} assigned to ${member.email ?? member.userId}.`);
      await load(activeLeagueId, seasonId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not assign team.");
    } finally {
      setPendingKey(undefined);
    }
  }

  async function removeTeam(assignment: CfpAssignment) {
    setPendingKey(`remove:${assignment.teamKey}`);
    try {
      await apiSend("/admin/cfp/assignments", "DELETE", {
        leagueId: activeLeagueId,
        seasonId,
        teamKey: assignment.teamKey
      });
      setStatus(`${assignment.teamName} removed from ${assignment.memberLabel}.`);
      await load(activeLeagueId, seasonId);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not remove team.");
    } finally {
      setPendingKey(undefined);
    }
  }

  const selectedLeague = leagues.find((league) => league.leagueId === activeLeagueId);
  const latestScrape = adminPayload?.latestScrape ?? payload?.latestScrape;
  const enabled = payload?.config.enabled === true;
  const seasonOptions = [...new Set([appConfig.seasonId, seasonId, ...seasons.map((item) => item.seasonId)])].sort().reverse();

  return (
    <AuthGuard>
      <AppShell>
        <FadeContent className="mx-auto max-w-6xl px-5 py-8 md:px-8">
          <div className="flex flex-wrap items-end justify-between gap-4">
            <div>
              <p className="text-sm font-semibold uppercase tracking-[0.2em] text-turf">College Football Playoff</p>
              <h1 className="text-4xl font-semibold">CFP Team Tracker</h1>
              <p className="mt-2 text-ink/65 dark:text-zinc-400">See each player&apos;s assigned teams and DraftKings make-the-playoff odds.</p>
            </div>
            <div className="flex flex-wrap gap-2">
              <select className="rounded border border-ink/20 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900" value={activeLeagueId} onChange={(event) => { setActiveLeagueId(event.target.value); persistPreferredLeagueId(event.target.value); }}>
                {leagues.map((league) => <option key={league.leagueId} value={league.leagueId}>{league.name}</option>)}
              </select>
              <select className="rounded border border-ink/20 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900" value={seasonId} onChange={(event) => setSeasonId(event.target.value)}>
                {seasonOptions.map((season) => <option key={season} value={season}>{season}</option>)}
              </select>
            </div>
          </div>

          {status ? <MagicCard className="mt-4 p-3 text-sm dark:text-zinc-200">{status}</MagicCard> : null}

          {payload?.canManage ? (
            <MagicCard className="mt-6 p-4">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <h2 className="text-xl font-semibold">Season Settings</h2>
                  <p className="text-sm text-ink/60 dark:text-zinc-400">{selectedLeague?.name} · {seasonId} · {enabled ? "Enabled" : "Disabled"}</p>
                </div>
                <div className="flex flex-wrap gap-2">
                  <button className="rounded border border-ink/20 px-3 py-2 text-sm font-semibold dark:border-white/15" disabled={pendingKey === "settings"} onClick={() => void setEnabled(!enabled)}>{enabled ? "Disable tracker" : "Enable tracker"}</button>
                  <ShimmerButton disabled={!enabled || pendingKey === "refresh"} onClick={() => void refreshOdds()}>{pendingKey === "refresh" ? "Starting..." : "Refresh odds"}</ShimmerButton>
                </div>
              </div>
              <div className="mt-4 rounded border border-ink/10 p-3 dark:border-white/10">
                <label className="text-sm font-semibold" htmlFor="cfp-odds-list">Paste current team and odds list</label>
                <textarea
                  className="mt-2 min-h-44 w-full resize-y rounded border border-ink/20 bg-white px-3 py-2 font-mono text-sm dark:border-white/15 dark:bg-zinc-950"
                  id="cfp-odds-list"
                  onChange={(event) => setOddsText(event.target.value)}
                  placeholder={'Notre Dame\n−800\n\nOhio State\n−360\n\nTexas A&M\n+154'}
                  spellCheck={false}
                  value={oddsText}
                />
                <div className="mt-3 flex flex-wrap items-center justify-between gap-3">
                  <p className="text-xs text-ink/60 dark:text-zinc-400">
                    Put each team name on one line and its American odds on the next. Blank lines are allowed. Omitted teams become unavailable; picked odds remain unchanged.
                  </p>
                  <button
                    className="rounded bg-turf px-3 py-2 text-sm font-semibold text-white disabled:opacity-50"
                    disabled={!oddsText.trim() || pendingKey === "upload"}
                    onClick={() => void submitOddsList()}
                  >
                    {pendingKey === "upload" ? "Submitting..." : "Submit odds"}
                  </button>
                </div>
              </div>
              <ScrapeStatus run={latestScrape} />
            </MagicCard>
          ) : latestScrape ? <MagicCard className="mt-6 p-4"><ScrapeStatus run={latestScrape} /></MagicCard> : null}

          {!enabled ? (
            <MagicCard className="mt-6 p-6 text-ink/65 dark:text-zinc-400">
              CFP tracking is not enabled for {selectedLeague?.name ?? "this league"} in {seasonId}.
            </MagicCard>
          ) : (
            <>
              {adminPayload ? (
                <section className="mt-6">
                  <h2 className="mb-3 text-2xl font-semibold">Manage Assignments</h2>
                  <div className="grid gap-3 md:grid-cols-2">
                    {members.map((member) => {
                      const memberAssignments = assignments.filter((item) => item.userId === member.userId);
                      return (
                        <MagicCard className="p-4" key={member.userId}>
                          <div className="font-semibold">{member.email ?? member.userId}</div>
                          <div className="mt-3 flex gap-2">
                            <input className="min-w-0 flex-1 rounded border border-ink/20 px-3 py-2 text-sm dark:border-white/15 dark:bg-zinc-950" list={`cfp-teams-${member.userId}`} placeholder={availableOdds.length ? "Type a team" : "Refresh odds to load teams"} value={teamInputs[member.userId] ?? ""} onChange={(event) => setTeamInputs((current) => ({ ...current, [member.userId]: event.target.value }))} />
                            <datalist id={`cfp-teams-${member.userId}`}>{availableOdds.map((item) => <option key={item.teamKey} value={item.teamName}>{formatOdds(item.americanOdds)}</option>)}</datalist>
                            <button className="rounded bg-turf px-3 py-2 text-sm font-semibold text-white disabled:opacity-50" disabled={!availableOdds.length || pendingKey === `add:${member.userId}`} onClick={() => void assignTeam(member)}>Add</button>
                          </div>
                          <div className="mt-3 flex flex-wrap gap-2">
                            {memberAssignments.map((assignment) => (
                              <span className="inline-flex items-center gap-2 rounded-full bg-ink/5 px-3 py-1 text-sm dark:bg-white/10" key={assignment.teamKey}>
                                {assignment.teamName} {formatOdds(assignment.pickedOdds)}
                                <button aria-label={`Remove ${assignment.teamName}`} className="font-bold text-red-600 disabled:opacity-40 dark:text-red-300" disabled={pendingKey === `remove:${assignment.teamKey}`} onClick={() => void removeTeam(assignment)}>×</button>
                              </span>
                            ))}
                            {!memberAssignments.length ? <span className="text-sm text-ink/50 dark:text-zinc-500">No teams assigned.</span> : null}
                          </div>
                        </MagicCard>
                      );
                    })}
                  </div>
                </section>
              ) : null}

              <section className="mt-8">
                <h2 className="mb-3 text-2xl font-semibold">League Assignments</h2>
                <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
                  {groupByMember(assignments).map(([memberLabel, rows]) => (
                    <MagicCard className="p-4" key={memberLabel}>
                      <h3 className="font-semibold">{memberLabel}</h3>
                      <div className="mt-3 space-y-2">
                        {rows.map((row) => (
                          <div className="rounded bg-ink/5 p-3 text-sm dark:bg-white/5" key={row.teamKey}>
                            <div className="font-semibold">{row.teamName}</div>
                            <div className="mt-1 text-ink/65 dark:text-zinc-400">Picked {formatOdds(row.pickedOdds)} → Current {row.currentOdds === undefined ? "—" : formatOdds(row.currentOdds)}</div>
                            {!row.available ? <div className="mt-1 text-xs font-semibold text-amber-700 dark:text-amber-300">Not currently listed</div> : null}
                          </div>
                        ))}
                      </div>
                    </MagicCard>
                  ))}
                </div>
                {!assignments.length ? <MagicCard className="p-6 text-ink/60 dark:text-zinc-400">No CFP teams have been assigned yet.</MagicCard> : null}
              </section>
            </>
          )}
        </FadeContent>
      </AppShell>
    </AuthGuard>
  );
}

function formatOdds(odds: number): string {
  return odds > 0 ? `+${odds}` : String(odds);
}

function groupByMember(assignments: CfpAssignment[]): Array<[string, CfpAssignment[]]> {
  const groups = new Map<string, CfpAssignment[]>();
  for (const assignment of assignments) {
    groups.set(assignment.memberLabel, [...(groups.get(assignment.memberLabel) ?? []), assignment]);
  }
  return [...groups.entries()].sort(([a], [b]) => a.localeCompare(b));
}

function ScrapeStatus({ run }: { run?: CfpScrapeRun }) {
  if (!run) return <p className="mt-3 text-sm text-ink/60 dark:text-zinc-400">No CFP odds scrape has completed for this season.</p>;
  return (
    <div className="mt-3 text-sm text-ink/60 dark:text-zinc-400">
      Latest odds update: <strong>{run.status}</strong> · {run.parsedTeamCount} teams · {new Date(run.capturedAt).toLocaleString()}
      {run.errors.length ? <div className="mt-1 text-red-700 dark:text-red-300">{run.errors.join(" ")}</div> : null}
    </div>
  );
}
