import { gradeProposal } from "./grading";
import { responseResult } from "./pickRules";
import type { Game, LeagueMember, LineProposal, OpeningLine, ProposalResponse, SportLeague, Standing } from "./types";

export interface FinalScore {
  sportLeague: SportLeague;
  awayTeam: string;
  homeTeam: string;
  awayScore: number;
  homeScore: number;
  completed: boolean;
  kickoffAt?: string;
  sourceId?: string;
}

export function parseEspnScoreboard(payload: unknown, sportLeague: SportLeague): FinalScore[] {
  const events = isRecord(payload) && Array.isArray(payload.events) ? payload.events : [];
  const scores: FinalScore[] = [];

  for (const event of events) {
    if (!isRecord(event)) {
      continue;
    }
    const competition = Array.isArray(event.competitions) && isRecord(event.competitions[0]) ? event.competitions[0] : undefined;
    const competitors = competition && Array.isArray(competition.competitors) ? competition.competitors.filter(isRecord) : [];
    const home = competitors.find((competitor) => competitor.homeAway === "home");
    const away = competitors.find((competitor) => competitor.homeAway === "away");
    const status = competition && isRecord(competition.status) ? competition.status : event.status;
    const statusType = isRecord(status) && isRecord(status.type) ? status.type : undefined;
    const completed = statusType?.completed === true;
    const awayTeam = teamName(away);
    const homeTeam = teamName(home);
    const awayScore = scoreNumber(away?.score);
    const homeScore = scoreNumber(home?.score);

    if (!awayTeam || !homeTeam || awayScore === undefined || homeScore === undefined) {
      continue;
    }

    scores.push({
      sportLeague,
      awayTeam,
      homeTeam,
      awayScore,
      homeScore,
      completed,
      kickoffAt: typeof event.date === "string" ? event.date : undefined,
      sourceId: typeof event.id === "string" ? event.id : undefined
    });
  }

  return scores;
}

export function findMatchingFinalScore(game: Game, scores: FinalScore[]): FinalScore | undefined {
  return scores.find((score) =>
    score.completed &&
    score.sportLeague === game.sportLeague &&
    normalizeTeam(score.awayTeam) === normalizeTeam(game.awayTeam) &&
    normalizeTeam(score.homeTeam) === normalizeTeam(game.homeTeam) &&
    sameUtcDate(score.kickoffAt, game.kickoffAt)
  ) ?? scores.find((score) =>
    score.completed &&
    score.sportLeague === game.sportLeague &&
    normalizeTeam(score.awayTeam) === normalizeTeam(game.awayTeam) &&
    normalizeTeam(score.homeTeam) === normalizeTeam(game.homeTeam)
  );
}

export function gradeProposalAndResponses(
  game: Game,
  lines: OpeningLine[],
  proposal: LineProposal,
  responses: ProposalResponse[]
): { proposal: LineProposal; responses: ProposalResponse[] } | undefined {
  const line = lines.find((item) => item.market === proposal.market);
  if (!line) {
    return undefined;
  }
  const gradedProposal = gradeProposal(game, line, proposal);
  return {
    proposal: gradedProposal,
    responses: responses
      .filter((response) => response.proposalId === proposal.proposalId)
      .map((response) => ({
        ...response,
        result: responseResult(gradedProposal.result, response.stance)
      }))
  };
}

export function buildStandings(
  leagueId: string,
  seasonId: string,
  members: LeagueMember[],
  proposals: LineProposal[],
  responses: ProposalResponse[],
  nowIso: string
): Standing[] {
  const displayNames = new Map(members.map((member) => [member.userId, member.email ?? member.userId]));
  const proposalById = new Map(proposals.map((proposal) => [proposal.proposalId, proposal]));
  const rows = new Map<string, Standing>();

  for (const response of responses) {
    if (response.result === "pending") {
      continue;
    }
    addResult(rows, leagueId, seasonId, response.responderId, displayNames.get(response.responderId), response.result, nowIso);
  }

  for (const proposal of proposals) {
    if (proposal.proposalSource === "admin_selected" || proposal.result === "pending") {
      continue;
    }
    const hasSelfResponse = responses.some((response) => response.proposalId === proposal.proposalId && response.responderId === proposal.proposerId);
    if (!hasSelfResponse && proposalById.has(proposal.proposalId)) {
      addResult(rows, leagueId, seasonId, proposal.proposerId, displayNames.get(proposal.proposerId) ?? proposal.proposerLabel, proposal.result, nowIso);
    }
  }

  return [...rows.values()].sort(compareStandings).map((row) => {
    const decisions = row.wins + row.losses;
    return {
      ...row,
      winPercentage: decisions ? Number((row.wins / decisions).toFixed(3)) : 0
    };
  });
}

function addResult(
  rows: Map<string, Standing>,
  leagueId: string,
  seasonId: string,
  userId: string,
  displayName: string | undefined,
  result: "win" | "loss" | "push",
  lastUpdatedAt: string
): void {
  const row = rows.get(userId) ?? {
    leagueId,
    seasonId,
    userId,
    displayName: displayName ?? shortUserId(userId),
    wins: 0,
    losses: 0,
    pushes: 0,
    winPercentage: 0,
    lastUpdatedAt
  };
  if (result === "win") {
    row.wins += 1;
  } else if (result === "loss") {
    row.losses += 1;
  } else {
    row.pushes += 1;
  }
  row.lastUpdatedAt = lastUpdatedAt;
  rows.set(userId, row);
}

function compareStandings(a: Standing, b: Standing): number {
  const aGames = a.wins + a.losses;
  const bGames = b.wins + b.losses;
  const aPct = aGames ? a.wins / aGames : 0;
  const bPct = bGames ? b.wins / bGames : 0;
  return b.wins - a.wins || bPct - aPct || a.losses - b.losses || a.displayName.localeCompare(b.displayName);
}

function teamName(competitor: Record<string, unknown> | undefined): string | undefined {
  if (!competitor || !isRecord(competitor.team)) {
    return undefined;
  }
  const team = competitor.team;
  return stringValue(team.displayName) ?? stringValue(team.shortDisplayName) ?? stringValue(team.name) ?? stringValue(team.location);
}

function scoreNumber(value: unknown): number | undefined {
  if (typeof value === "number") {
    return value;
  }
  if (typeof value === "string" && value.trim()) {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }
  return undefined;
}

function sameUtcDate(a?: string, b?: string): boolean {
  if (!a || !b) {
    return true;
  }
  return a.slice(0, 10) === b.slice(0, 10);
}

function normalizeTeam(value: string): string {
  return value.toLowerCase().replace(/&/g, "and").replace(/[^a-z0-9]+/g, "");
}

function stringValue(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === "object";
}

function shortUserId(userId: string): string {
  return userId.length <= 12 ? userId : `${userId.slice(0, 8)}...`;
}
