import type { EventBridgeEvent } from "aws-lambda";
import { PickemRepository } from "./repository";
import { buildStandings, findMatchingFinalScore, gradeProposalAndResponses, parseEspnScoreboard } from "./resultsSyncRules";
import type { FinalScore } from "./resultsSyncRules";
import type { PlayerPick, SportLeague, Week, LineProposal } from "./types";

const scoreboardUrls: Record<SportLeague, string> = {
  NFL: "https://site.api.espn.com/apis/site/v2/sports/football/nfl/scoreboard",
  NCAAF: "https://site.api.espn.com/apis/site/v2/sports/football/college-football/scoreboard"
};

export async function handler(_event: EventBridgeEvent<"Scheduled Event", unknown>): Promise<{
  checkedWeeks: number;
  finalizedGames: number;
  gradedProposals: number;
  standingsRows: number;
  errors: string[];
}> {
  const repository = new PickemRepository();
  const nowIso = new Date().toISOString();
  const weeks = (await repository.listWeeks()).filter(isResultsCandidate);
  const scoreCache = new Map<string, FinalScore[]>();
  let finalizedGames = 0;
  let gradedProposals = 0;
  let standingsRows = 0;
  const errors: string[] = [];

  for (const week of weeks) {
    try {
      const games = await repository.listWeekGames(week.leagueId, week.seasonId, week.weekId);
      const scores = await scoresForWeek(scoreCache, week);
      const finalized = games.map((game) => {
        if (game.status === "final") {
          return game;
        }
        const score = findMatchingFinalScore(game, scores);
        return score ? { ...game, status: "final" as const, awayScore: score.awayScore, homeScore: score.homeScore } : game;
      });

      for (const game of finalized.filter((game) => game.status === "final" && games.some((existing) => existing.gameId === game.gameId && existing.status !== "final"))) {
        await repository.updateGameResult(game, game.awayScore ?? 0, game.homeScore ?? 0);
        finalizedGames += 1;
      }

      const [persistedProposals, legacyPicks, responses, members] = await Promise.all([
        repository.listProposals(week.leagueId, week.seasonId, week.weekId),
        repository.listPicks(week.leagueId, week.seasonId, week.weekId),
        repository.listProposalResponses(week.leagueId, week.seasonId, week.weekId),
        repository.listLeagueMembers(week.leagueId)
      ]);
      const proposals = mergeLegacyPickProposals(persistedProposals, legacyPicks);
      const persistedProposalIds = new Set(persistedProposals.map((proposal) => proposal.proposalId));

      const updatedProposals = [...proposals];
      const updatedResponses = [...responses];
      for (const proposal of proposals) {
        const game = finalized.find((item) => item.gameId === proposal.gameId);
        if (!game || game.status !== "final") {
          continue;
        }
        const lines = await repository.listOpeningLines(game.gameId);
        const graded = gradeProposalAndResponses(game, lines, proposal, responses);
        if (!graded) {
          continue;
        }
        if (persistedProposalIds.has(proposal.proposalId)) {
          await repository.updateProposalResult(proposal, graded.proposal.result);
        }
        const proposalIndex = updatedProposals.findIndex((item) => item.proposalId === proposal.proposalId);
        if (proposalIndex >= 0) {
          updatedProposals[proposalIndex] = graded.proposal;
        }
        gradedProposals += 1;

        for (const response of graded.responses) {
          await repository.updateProposalResponseResult(response, response.result);
          const responseIndex = updatedResponses.findIndex((item) => item.proposalId === response.proposalId && item.responderId === response.responderId);
          if (responseIndex >= 0) {
            updatedResponses[responseIndex] = response;
          }
        }
      }

      const standings = buildStandings(week.leagueId, week.seasonId, members, updatedProposals, updatedResponses, nowIso);
      for (const standing of standings) {
        await repository.putStanding(standing);
        standingsRows += 1;
      }
    } catch (error) {
      errors.push(`${week.leagueId} ${week.seasonId} week ${week.weekId}: ${error instanceof Error ? error.message : "Unknown results sync error."}`);
    }
  }

  if (errors.length) {
    console.error("Results sync completed with errors", { errors });
  }
  return { checkedWeeks: weeks.length, finalizedGames, gradedProposals, standingsRows, errors };
}

async function scoresForWeek(cache: Map<string, FinalScore[]>, week: Week): Promise<FinalScore[]> {
  const sports = new Set<SportLeague>(["NFL", "NCAAF"]);
  const scores: FinalScore[] = [];
  for (const sportLeague of sports) {
    const key = `${sportLeague}#${week.seasonId}#${week.weekId}`;
    if (!cache.has(key)) {
      const response = await fetch(scoreboardUrl(sportLeague, week), {
        headers: {
          "accept": "application/json",
          "user-agent": "pickem-bot-results-sync/1.0"
        }
      });
      if (!response.ok) {
        throw new Error(`${sportLeague} scoreboard returned HTTP ${response.status}.`);
      }
      cache.set(key, parseEspnScoreboard(await response.json(), sportLeague));
    }
    scores.push(...(cache.get(key) ?? []));
  }
  return scores;
}

function scoreboardUrl(sportLeague: SportLeague, week: Week): string {
  const url = new URL(scoreboardUrls[sportLeague]);
  url.searchParams.set("year", week.seasonId);
  url.searchParams.set("seasontype", "2");
  url.searchParams.set("week", week.weekId);
  return url.toString();
}

function isResultsCandidate(week: Week): boolean {
  return week.status === "open" || week.status === "locked" || week.status === "graded";
}

function mergeLegacyPickProposals(proposals: LineProposal[], picks: PlayerPick[]): LineProposal[] {
  const merged = new Map<string, LineProposal>();
  for (const proposal of proposals) {
    merged.set(proposal.proposalId, proposal);
  }
  for (const pick of picks) {
    const proposalId = `${pick.userId}::${pick.optionId}`;
    if (merged.has(proposalId)) {
      continue;
    }
    merged.set(proposalId, {
      leagueId: pick.leagueId,
      seasonId: pick.seasonId,
      weekId: pick.weekId,
      proposalId,
      optionId: pick.optionId,
      gameId: pick.gameId,
      proposerId: pick.userId,
      proposerLabel: pick.userId,
      proposalSource: "member",
      sportLeague: pick.sportLeague,
      team: pick.team,
      market: pick.market,
      side: pick.side,
      lineValue: pick.lineValue,
      label: `${pick.team} ${pick.side} ${pick.lineValue}`,
      submittedAt: pick.submittedAt,
      result: pick.result
    });
  }
  return [...merged.values()];
}
