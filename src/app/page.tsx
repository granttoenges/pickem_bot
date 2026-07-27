"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { AppShell } from "../components/AppShell";
import { GameOddsBoard } from "../components/GameOddsBoard";
import { TeamLogo } from "../components/TeamLogo";
import { apiGet, apiSend, AppLeague, GameWithOptions, LineProposal, PickClaim, PickOption, ProposalResponse, ProposalResponseStance, ProposalSummary, SportLeague, Week, weekQuery } from "../lib/api";
import { appConfig } from "../lib/config";
import { getPreferredLeagueId, persistPreferredLeagueId } from "../lib/leaguePreference";

type Tab = "available" | "mine" | "league";
type SportFilter = "all" | SportLeague;

export default function PlayerBoardPage() {
  const [leagues, setLeagues] = useState<AppLeague[]>([]);
  const [activeLeagueId, setActiveLeagueId] = useState("");
  const [weeks, setWeeks] = useState<Week[]>([]);
  const [activeSeasonId, setActiveSeasonId] = useState(appConfig.seasonId);
  const [activeWeekId, setActiveWeekId] = useState(appConfig.weekId);
  const [week, setWeek] = useState<Week>();
  const [games, setGames] = useState<GameWithOptions[]>([]);
  const [claims, setClaims] = useState<PickClaim[]>([]);
  const [proposals, setProposals] = useState<LineProposal[]>([]);
  const [userProposals, setUserProposals] = useState<LineProposal[]>([]);
  const [proposalResponses, setProposalResponses] = useState<ProposalResponse[]>([]);
  const [userProposalResponses, setUserProposalResponses] = useState<ProposalResponse[]>([]);
  const [summary, setSummary] = useState<ProposalSummary>();
  const [tab, setTab] = useState<Tab>("available");
  const [sportFilter, setSportFilter] = useState<SportFilter>("all");
  const [replaceProposalId, setReplaceProposalId] = useState<string>();
  const [status, setStatus] = useState("Loading leagues...");
  const [quotaModalMessage, setQuotaModalMessage] = useState("");
  const [pendingProposalId, setPendingProposalId] = useState<string>();
  const [pendingOptionId, setPendingOptionId] = useState<string>();
  const quotaModalTimeout = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

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
    apiGet<{ weeks: Week[] }>(`/weeks?leagueId=${encodeURIComponent(activeLeagueId)}&seasonId=${encodeURIComponent(activeSeasonId)}`)
      .then((payload) => {
        setWeeks(payload.weeks);
        const preferred = payload.weeks.find((item) => item.weekId === activeWeekId) ?? payload.weeks[0];
        if (preferred) {
          setActiveSeasonId(preferred.seasonId);
          setActiveWeekId(preferred.weekId);
          void loadWeek(activeLeagueId, preferred.seasonId, preferred.weekId);
        } else {
          void loadWeek(activeLeagueId, activeSeasonId, activeWeekId);
        }
      })
      .catch(() => void loadWeek(activeLeagueId, activeSeasonId, activeWeekId));
  }, [activeLeagueId]);

  useEffect(() => {
    if (!activeLeagueId) {
      return;
    }
    void loadWeek(activeLeagueId, activeSeasonId, activeWeekId);
  }, [activeSeasonId, activeWeekId]);

  useEffect(() => {
    return () => {
      if (quotaModalTimeout.current) {
        clearTimeout(quotaModalTimeout.current);
      }
    };
  }, []);

  function showQuotaModal(message: string) {
    if (quotaModalTimeout.current) {
      clearTimeout(quotaModalTimeout.current);
    }
    setQuotaModalMessage(message);
    quotaModalTimeout.current = setTimeout(() => {
      setQuotaModalMessage("");
      quotaModalTimeout.current = undefined;
    }, 1000);
  }

  async function loadWeek(leagueId = activeLeagueId, seasonId = activeSeasonId, weekId = activeWeekId) {
    try {
      const payload = await apiGet<{
        pickMode: AppLeague["pickMode"];
        week: Week;
        games: GameWithOptions[];
        claims: PickClaim[];
        proposals: LineProposal[];
        userProposals: LineProposal[];
        proposalResponses: ProposalResponse[];
        userProposalResponses: ProposalResponse[];
        proposalSummary: ProposalSummary;
      }>(`/week?${weekQuery(leagueId, seasonId, weekId)}`);
      setWeek(payload.week);
      setGames(payload.games);
      setClaims(payload.claims);
      setProposals(payload.proposals);
      setUserProposals(payload.userProposals);
      setProposalResponses(payload.proposalResponses);
      setUserProposalResponses(payload.userProposalResponses);
      setSummary(payload.proposalSummary);
      setStatus("");
      setReplaceProposalId(undefined);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not load weekly board.");
    }
  }

  async function proposeOption(option: PickOption) {
    if (locked) {
      return;
    }
    const activeLeague = leagues.find((league) => league.leagueId === activeLeagueId);
    if ((activeLeague?.pickMode ?? "member_proposed") === "admin_selected") {
      setStatus("This league uses admin-selected lines. Go to League Picks to choose with or against.");
      return;
    }
    const currentProposal = userProposals.find((proposal) => proposal.optionId === option.optionId);
    if (currentProposal) {
      await releaseProposal(currentProposal.proposalId);
      return;
    }
    const sameSportCount = userProposals.filter((proposal) => proposal.sportLeague === option.sportLeague && proposal.proposalId !== replaceProposalId).length;
    const required = option.sportLeague === "NFL" ? week?.nflPickCountRequired : week?.ncaafPickCountRequired;
    if (!replaceProposalId && required !== undefined && sameSportCount >= required) {
      showQuotaModal(`Your ${option.sportLeague} proposed lines are full. Go to My Picks to change or release a line first.`);
      return;
    }
    try {
      setPendingOptionId(option.optionId);
      await apiSend("/proposals", "PUT", {
        leagueId: option.leagueId,
        seasonId: option.seasonId,
        weekId: option.weekId,
        optionId: option.optionId,
        previousProposalId: replaceProposalId
      });
      setStatus(`Proposed ${option.label}.`);
      await loadWeek();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not propose line.");
    } finally {
      setPendingOptionId(undefined);
    }
  }

  async function releaseProposal(proposalId: string) {
    if (!week || locked) {
      return;
    }
    try {
      await apiSend("/proposals", "DELETE", {
        leagueId: week.leagueId,
        seasonId: week.seasonId,
        weekId: week.weekId,
        proposalId
      });
      setStatus("Proposed line released.");
      await loadWeek();
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not release proposed line.");
    }
  }

  async function respondToProposal(proposal: LineProposal, stance: ProposalResponseStance) {
    if (!week || locked) {
      return;
    }
    try {
      setPendingProposalId(proposal.proposalId);
      await apiSend("/proposal-responses", "PUT", {
        leagueId: proposal.leagueId,
        seasonId: proposal.seasonId,
        weekId: proposal.weekId,
        proposalId: proposal.proposalId,
        stance
      });
      setStatus(`You are ${stance} ${proposal.proposerLabel ?? "that member"} on ${proposal.label}.`);
      await loadWeek();
      setTab("league");
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Could not save response.");
    } finally {
      setPendingProposalId(undefined);
    }
  }

  const activeLeague = leagues.find((league) => league.leagueId === activeLeagueId);
  const pickMode = activeLeague?.pickMode ?? "member_proposed";
  const userOptionIds = new Set(userProposals.map((proposal) => proposal.optionId));
  const gamesById = new Map(games.map((game) => [game.gameId, game]));
  const userResponseByProposal = new Map(userProposalResponses.map((response) => [response.proposalId, response]));
  const otherProposals = proposals.filter((proposal) => proposal.proposalSource === "admin_selected" || !userProposals.some((userProposal) => userProposal.proposalId === proposal.proposalId));
  const filteredGames = filterBySport(games, sportFilter);
  const filteredUserProposals = filterBySport(userProposals, sportFilter);
  const filteredOtherProposals = filterBySport(otherProposals, sportFilter);
  const emptySportLabel = sportEmptyLabel(sportFilter);

  return (
    <AppShell>
      {quotaModalMessage ? (
        <div className="fixed inset-x-0 top-6 z-50 flex justify-center px-4">
          <div role="alert" aria-live="assertive" className="max-w-md rounded border border-gold/50 bg-white px-4 py-3 text-center text-sm font-semibold text-ink shadow-lg ring-1 ring-ink/5 dark:bg-zinc-900 dark:text-zinc-100 dark:ring-white/10">
            {quotaModalMessage}
          </div>
        </div>
      ) : null}
      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-turf">Player Portal</p>
            <h1 className="text-4xl font-semibold">Weekly Proposed Lines</h1>
            <p className="mt-2 text-ink/65 dark:text-zinc-400">{week ? `${week.label} locks ${new Date(week.cutoffAt).toLocaleString()}` : "Propose lines and respond to league picks."}</p>
          </div>
          <div className="flex flex-wrap items-center gap-3">
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
            {weeks.length > 1 ? (
              <select
                className="rounded border border-ink/20 bg-white px-3 py-2 dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"
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
            <span className={`rounded px-3 py-2 text-sm font-semibold ${locked ? "bg-red-100 text-red-800" : "bg-turf text-white"}`}>
              {locked ? "Picks Locked" : "Picks Open"}
            </span>
          </div>
        </div>

        {summary && pickMode === "member_proposed" ? (
          <div className="mb-4 grid gap-3 md:grid-cols-3">
            <Quota label="NFL" submitted={summary.NFL.submitted} required={summary.NFL.required} />
            <Quota label="CFB" submitted={summary.NCAAF.submitted} required={summary.NCAAF.required} />
            <div className={`rounded border p-4 ${summary.complete ? "border-turf bg-turf/10 dark:border-emerald-400/50 dark:bg-emerald-400/10" : "border-ink/10 bg-white dark:border-white/10 dark:bg-zinc-900"}`}>
              <div className="text-sm font-semibold text-ink/60 dark:text-zinc-400">Card Status</div>
              <div className="mt-1 text-xl font-semibold">{summary.complete ? "Complete" : "Incomplete"}</div>
            </div>
          </div>
        ) : null}

        {status ? <div className="mb-4 rounded border border-ink/10 bg-white p-3 text-sm dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-200">{status}</div> : null}

        <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
          <div className="flex gap-2">
            <button className={tabClass(tab === "available")} onClick={() => setTab("available")}>Available Games</button>
            <button className={tabClass(tab === "mine")} onClick={() => setTab("mine")}>My Picks</button>
            <button className={tabClass(tab === "league")} onClick={() => setTab("league")}>League Picks</button>
          </div>
          <div className="flex rounded border border-ink/15 bg-white p-1 shadow-sm dark:border-white/15 dark:bg-zinc-900">
            {(["all", "NFL", "NCAAF"] as SportFilter[]).map((filter) => (
              <button
                key={filter}
                className={sportFilterClass(sportFilter === filter)}
                onClick={() => setSportFilter(filter)}
              >
                {sportFilterLabel(filter)}
              </button>
            ))}
          </div>
        </div>

        {tab === "available" ? (
          <div className="space-y-3">
            {pickMode === "admin_selected" ? (
              <div className="rounded border border-ink/10 bg-white p-3 text-sm text-ink/70 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-300">
                This league uses admin-selected lines. Review available games here, then use League Picks to choose with or against.
              </div>
            ) : null}
            {filteredGames.map((game) => (
              <GameOddsBoard
                key={game.gameId}
                game={game}
                claims={[]}
                userOptionIds={userOptionIds}
                locked={locked || pickMode === "admin_selected"}
                mode={pickMode === "admin_selected" ? "summary" : "claim"}
                onPick={pickMode === "admin_selected" ? undefined : proposeOption}
                pendingOptionId={pendingOptionId}
              />
            ))}
            {!filteredGames.length && !status ? <div className="rounded border border-ink/10 bg-white p-6 dark:border-white/10 dark:bg-zinc-900">No {emptySportLabel}games are available for this league week yet.</div> : null}
          </div>
        ) : tab === "mine" ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {filteredUserProposals.map((proposal) => {
              const game = gamesById.get(proposal.gameId);
              const response = userResponseByProposal.get(proposal.proposalId);
              return (
                <article key={proposal.proposalId} className={`rounded border bg-white p-4 dark:bg-zinc-900 ${replaceProposalId === proposal.proposalId ? "border-gold ring-2 ring-gold/30 dark:ring-gold/40" : "border-ink/10 dark:border-white/10"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <ProposalLogo proposal={proposal} game={game} />
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-turf">{proposal.sportLeague}</div>
                        <h2 className="mt-1 font-semibold">{proposal.team}</h2>
                        <p className="text-sm text-ink/60 dark:text-zinc-400">{formatMarket(proposal)} · {gameLabel(game)}</p>
                      </div>
                    </div>
                    <span className="rounded bg-gold/25 px-3 py-1 text-xs font-bold uppercase text-ink dark:text-zinc-100">
                      {response?.stance ?? "with"}
                    </span>
                  </div>
                  <p className="mt-2 text-sm font-medium">{proposal.result}</p>
                  <div className="mt-4 flex gap-2">
                    <button className="rounded bg-ink px-3 py-2 text-sm font-semibold text-white disabled:bg-ink/35 dark:bg-zinc-100 dark:text-zinc-950 dark:disabled:bg-white/20 dark:disabled:text-zinc-500" disabled={locked} onClick={() => { setReplaceProposalId(proposal.proposalId); setTab("available"); }}>
                      Change
                    </button>
                    <button className="rounded border border-ink/20 px-3 py-2 text-sm font-semibold disabled:text-ink/35 dark:border-white/15 dark:disabled:text-zinc-600" disabled={locked} onClick={() => releaseProposal(proposal.proposalId)}>
                      Release
                    </button>
                  </div>
                </article>
              );
            })}
            {!filteredUserProposals.length ? <div className="rounded border border-ink/10 bg-white p-6 text-ink/60 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400">{pickMode === "admin_selected" ? `This league uses admin-selected lines, so you do not need to propose your own ${emptySportLabel}lines.` : `You have not proposed any ${emptySportLabel}lines yet.`}</div> : null}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {filteredOtherProposals.map((proposal) => {
              const response = userResponseByProposal.get(proposal.proposalId);
              const game = gamesById.get(proposal.gameId);
              const totals = responseTotals(proposal.proposalId, proposalResponses);
              const responsePending = pendingProposalId === proposal.proposalId;
              return (
                <article key={proposal.proposalId} className="rounded border border-ink/15 bg-white p-4 shadow-sm ring-1 ring-ink/5 dark:border-white/15 dark:bg-zinc-900 dark:ring-white/5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="flex min-w-0 items-start gap-3">
                      <ProposalLogo proposal={proposal} game={game} />
                      <div className="min-w-0">
                        <div className="text-xs font-bold uppercase tracking-wide text-turf">{proposal.sportLeague} · proposed by {proposal.proposerLabel ?? "member"}</div>
                        <h2 className="mt-1 text-lg font-semibold">{proposal.label}</h2>
                        <p className="text-sm text-ink/60 dark:text-zinc-400">{formatMarket(proposal)} · {gameLabel(game)}</p>
                        <p className="mt-1 text-xs font-semibold text-ink/50 dark:text-zinc-500">{totals.with} with / {totals.against} against</p>
                      </div>
                    </div>
                    {response ? <span className="rounded bg-gold/25 px-3 py-1 text-xs font-bold uppercase text-ink dark:text-zinc-100">{response.stance}</span> : null}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      className={`rounded px-4 py-2 text-sm font-semibold disabled:bg-ink/20 disabled:text-ink/40 dark:disabled:bg-white/10 dark:disabled:text-zinc-600 ${response?.stance === "with" ? "bg-gold text-ink" : "border border-ink/20 bg-white text-ink dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"}`}
                      disabled={locked || responsePending}
                      onClick={() => respondToProposal(proposal, "with")}
                    >
                      {responsePending ? "Saving..." : "With"}
                    </button>
                    <button
                      className={`rounded px-4 py-2 text-sm font-semibold disabled:bg-ink/20 disabled:text-ink/40 dark:disabled:bg-white/10 dark:disabled:text-zinc-600 ${response?.stance === "against" ? "bg-gold text-ink" : "border border-ink/20 bg-white text-ink dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"}`}
                      disabled={locked || responsePending}
                      onClick={() => respondToProposal(proposal, "against")}
                    >
                      {responsePending ? "Saving..." : "Against"}
                    </button>
                  </div>
                </article>
              );
            })}
            {!filteredOtherProposals.length ? <div className="rounded border border-ink/10 bg-white p-6 text-ink/60 dark:border-white/10 dark:bg-zinc-900 dark:text-zinc-400">No {emptySportLabel}league picks are available yet.</div> : null}
          </div>
        )}
      </section>
    </AppShell>
  );
}

function Quota({ label, submitted, required }: { label: string; submitted: number; required: number }) {
  const complete = submitted === required;
  return (
    <div className={`rounded border p-4 ${complete ? "border-turf bg-turf/10 dark:border-emerald-400/50 dark:bg-emerald-400/10" : "border-ink/10 bg-white dark:border-white/10 dark:bg-zinc-900"}`}>
      <div className="text-sm font-semibold text-ink/60 dark:text-zinc-400">{label} Lines</div>
      <div className="mt-1 text-xl font-semibold">{submitted} / {required}</div>
    </div>
  );
}

function tabClass(active: boolean): string {
  return `rounded px-4 py-2 text-sm font-semibold ${active ? "bg-ink text-white dark:bg-zinc-100 dark:text-zinc-950" : "border border-ink/15 bg-white text-ink dark:border-white/15 dark:bg-zinc-900 dark:text-zinc-100"}`;
}

function sportFilterClass(active: boolean): string {
  return `rounded px-3 py-1.5 text-sm font-semibold transition ${active ? "bg-ink text-white dark:bg-zinc-100 dark:text-zinc-950" : "text-ink/65 hover:bg-ink/5 hover:text-ink dark:text-zinc-400 dark:hover:bg-white/10 dark:hover:text-zinc-100"}`;
}

function sportFilterLabel(filter: SportFilter): string {
  if (filter === "NCAAF") {
    return "NCAA";
  }
  if (filter === "NFL") {
    return "NFL";
  }
  return "All";
}

function sportEmptyLabel(filter: SportFilter): string {
  return filter === "all" ? "" : `${sportFilterLabel(filter)} `;
}

function filterBySport<T extends { sportLeague: SportLeague }>(items: T[], filter: SportFilter): T[] {
  if (filter === "all") {
    return items;
  }
  return items.filter((item) => item.sportLeague === filter);
}

function responseTotals(proposalId: string, responses: ProposalResponse[]): { with: number; against: number } {
  return responses
    .filter((response) => response.proposalId === proposalId)
    .reduce((totals, response) => {
      if (response.stance === "with") {
        totals.with += 1;
      } else {
        totals.against += 1;
      }
      return totals;
    }, { with: 0, against: 0 });
}

function formatMarket(proposal: LineProposal): string {
  if (proposal.market === "spread") {
    return `Spread ${proposal.lineValue > 0 ? `+${proposal.lineValue}` : proposal.lineValue}`;
  }
  if (proposal.market === "game_total") {
    return `Game total ${proposal.side} ${proposal.lineValue}`;
  }
  return `Team total ${proposal.side} ${proposal.lineValue}`;
}

function ProposalLogo({ proposal, game }: { proposal: LineProposal; game?: GameWithOptions }) {
  if (proposal.market === "game_total" && game) {
    return (
      <div className="flex shrink-0 items-center gap-1.5" aria-label={`${game.awayTeam} versus ${game.homeTeam}`}>
        <TeamLogo teamName={game.awayTeam} size="sm" />
        <span className="text-[10px] font-bold uppercase text-ink/40 dark:text-zinc-500">vs</span>
        <TeamLogo teamName={game.homeTeam} size="sm" />
      </div>
    );
  }

  return (
    <div className="flex shrink-0 items-center">
      <TeamLogo teamName={proposal.team} size="sm" />
    </div>
  );
}

function gameLabel(game?: GameWithOptions): string {
  return game ? `${game.awayTeam} at ${game.homeTeam}` : "Game";
}
