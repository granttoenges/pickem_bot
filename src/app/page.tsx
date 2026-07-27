"use client";

import { useEffect, useMemo, useState } from "react";
import { AppShell } from "../components/AppShell";
import { GameOddsBoard } from "../components/GameOddsBoard";
import { apiGet, apiSend, AppLeague, GameWithOptions, LineProposal, PickClaim, PickOption, ProposalResponse, ProposalResponseStance, ProposalSummary, Week, weekQuery } from "../lib/api";
import { getPreferredLeagueId, persistPreferredLeagueId } from "../lib/leaguePreference";

type Tab = "available" | "mine" | "league";

export default function PlayerBoardPage() {
  const [leagues, setLeagues] = useState<AppLeague[]>([]);
  const [activeLeagueId, setActiveLeagueId] = useState("");
  const [week, setWeek] = useState<Week>();
  const [games, setGames] = useState<GameWithOptions[]>([]);
  const [claims, setClaims] = useState<PickClaim[]>([]);
  const [proposals, setProposals] = useState<LineProposal[]>([]);
  const [userProposals, setUserProposals] = useState<LineProposal[]>([]);
  const [proposalResponses, setProposalResponses] = useState<ProposalResponse[]>([]);
  const [userProposalResponses, setUserProposalResponses] = useState<ProposalResponse[]>([]);
  const [summary, setSummary] = useState<ProposalSummary>();
  const [tab, setTab] = useState<Tab>("available");
  const [replaceProposalId, setReplaceProposalId] = useState<string>();
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
        pickMode: AppLeague["pickMode"];
        week: Week;
        games: GameWithOptions[];
        claims: PickClaim[];
        proposals: LineProposal[];
        userProposals: LineProposal[];
        proposalResponses: ProposalResponse[];
        userProposalResponses: ProposalResponse[];
        proposalSummary: ProposalSummary;
      }>(`/week?${weekQuery(leagueId)}`);
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
      setStatus(`Your ${option.sportLeague} proposed lines are full. Go to My Picks to change or release a line first.`);
      return;
    }
    try {
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
    }
  }

  const activeLeague = leagues.find((league) => league.leagueId === activeLeagueId);
  const pickMode = activeLeague?.pickMode ?? "member_proposed";
  const userOptionIds = new Set(userProposals.map((proposal) => proposal.optionId));
  const gamesById = new Map(games.map((game) => [game.gameId, game]));
  const userResponseByProposal = new Map(userProposalResponses.map((response) => [response.proposalId, response]));
  const otherProposals = proposals.filter((proposal) => proposal.proposalSource === "admin_selected" || !userProposals.some((userProposal) => userProposal.proposalId === proposal.proposalId));

  return (
    <AppShell>
      <section className="mx-auto max-w-7xl px-5 py-8 md:px-8">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4">
          <div>
            <p className="text-sm font-semibold uppercase tracking-[0.2em] text-turf">Player Portal</p>
            <h1 className="text-4xl font-semibold">Weekly Proposed Lines</h1>
            <p className="mt-2 text-ink/65">{week ? `${week.label} locks ${new Date(week.cutoffAt).toLocaleString()}` : "Propose lines and respond to league picks."}</p>
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

        {summary && pickMode === "member_proposed" ? (
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
          <button className={tabClass(tab === "league")} onClick={() => setTab("league")}>League Picks</button>
        </div>

        {tab === "available" ? (
          <div className="space-y-3">
            {pickMode === "admin_selected" ? (
              <div className="rounded border border-ink/10 bg-white p-3 text-sm text-ink/70">
                This league uses admin-selected lines. Review available games here, then use League Picks to choose with or against.
              </div>
            ) : null}
            {games.map((game) => (
              <GameOddsBoard
                key={game.gameId}
                game={game}
                claims={[]}
                userOptionIds={userOptionIds}
                locked={locked || pickMode === "admin_selected"}
                mode={pickMode === "admin_selected" ? "summary" : "claim"}
                onPick={pickMode === "admin_selected" ? undefined : proposeOption}
              />
            ))}
            {!games.length && !status ? <div className="rounded border border-ink/10 bg-white p-6">No games are available for this league week yet.</div> : null}
          </div>
        ) : tab === "mine" ? (
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {userProposals.map((proposal) => (
              <article key={proposal.proposalId} className={`rounded border bg-white p-4 ${replaceProposalId === proposal.proposalId ? "border-gold ring-2 ring-gold/30" : "border-ink/10"}`}>
                <div className="text-xs font-bold text-turf">{proposal.sportLeague}</div>
                <h2 className="mt-1 font-semibold">{proposal.team}</h2>
                <p className="text-sm text-ink/60">{formatMarket(proposal)} · {gameLabel(gamesById.get(proposal.gameId))}</p>
                <p className="mt-2 text-sm font-medium">{proposal.result}</p>
                <div className="mt-4 flex gap-2">
                  <button className="rounded bg-ink px-3 py-2 text-sm font-semibold text-white disabled:bg-ink/35" disabled={locked} onClick={() => { setReplaceProposalId(proposal.proposalId); setTab("available"); }}>
                    Change
                  </button>
                  <button className="rounded border border-ink/20 px-3 py-2 text-sm font-semibold disabled:text-ink/35" disabled={locked} onClick={() => releaseProposal(proposal.proposalId)}>
                    Release
                  </button>
                </div>
              </article>
            ))}
            {!userProposals.length ? <div className="rounded border border-ink/10 bg-white p-6 text-ink/60">{pickMode === "admin_selected" ? "This league uses admin-selected lines, so you do not need to propose your own lines." : "You have not proposed any lines yet."}</div> : null}
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {otherProposals.map((proposal) => {
              const response = userResponseByProposal.get(proposal.proposalId);
              return (
                <article key={proposal.proposalId} className="rounded border border-ink/15 bg-white p-4 shadow-sm ring-1 ring-ink/5">
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <div className="text-xs font-bold uppercase tracking-wide text-turf">{proposal.sportLeague} · proposed by {proposal.proposerLabel ?? "member"}</div>
                      <h2 className="mt-1 text-lg font-semibold">{proposal.label}</h2>
                      <p className="text-sm text-ink/60">{formatMarket(proposal)} · {gameLabel(gamesById.get(proposal.gameId))}</p>
                    </div>
                    {response ? <span className="rounded bg-gold/25 px-3 py-1 text-xs font-bold uppercase text-ink">{response.stance}</span> : null}
                  </div>
                  <div className="mt-4 flex gap-2">
                    <button
                      className={`rounded px-4 py-2 text-sm font-semibold disabled:bg-ink/20 disabled:text-ink/40 ${response?.stance === "with" ? "bg-gold text-ink" : "border border-ink/20 bg-white text-ink"}`}
                      disabled={locked}
                      onClick={() => respondToProposal(proposal, "with")}
                    >
                      With
                    </button>
                    <button
                      className={`rounded px-4 py-2 text-sm font-semibold disabled:bg-ink/20 disabled:text-ink/40 ${response?.stance === "against" ? "bg-gold text-ink" : "border border-ink/20 bg-white text-ink"}`}
                      disabled={locked}
                      onClick={() => respondToProposal(proposal, "against")}
                    >
                      Against
                    </button>
                  </div>
                </article>
              );
            })}
            {!otherProposals.length ? <div className="rounded border border-ink/10 bg-white p-6 text-ink/60">No league members have proposed lines yet.</div> : null}
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
      <div className="text-sm font-semibold text-ink/60">{label} Lines</div>
      <div className="mt-1 text-xl font-semibold">{submitted} / {required}</div>
    </div>
  );
}

function tabClass(active: boolean): string {
  return `rounded px-4 py-2 text-sm font-semibold ${active ? "bg-ink text-white" : "border border-ink/15 bg-white text-ink"}`;
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

function gameLabel(game?: GameWithOptions): string {
  return game ? `${game.awayTeam} at ${game.homeTeam}` : "Game";
}
