import type { LineProposal, PickResult, PlayerPick, ProposalResponse, ProposalResponseStance, SportLeague, Week } from "./types";

export function pickSummary(picks: PlayerPick[], week: Week) {
  const nfl = picks.filter((pick) => pick.sportLeague === "NFL").length;
  const ncaaf = picks.filter((pick) => pick.sportLeague === "NCAAF").length;
  return {
    NFL: { submitted: nfl, required: week.nflPickCountRequired, complete: nfl === week.nflPickCountRequired },
    NCAAF: { submitted: ncaaf, required: week.ncaafPickCountRequired, complete: ncaaf === week.ncaafPickCountRequired },
    complete: nfl === week.nflPickCountRequired && ncaaf === week.ncaafPickCountRequired
  };
}

export function validateQuota(week: Week, sportLeague: SportLeague, currentPicks: PlayerPick[], previousOptionId: string | undefined, nextOptionId: string): void {
  if (previousOptionId === nextOptionId) {
    return;
  }
  const existingCount = currentPicks.filter((pick) => pick.sportLeague === sportLeague && pick.optionId !== previousOptionId).length;
  const required = sportLeague === "NFL" ? week.nflPickCountRequired : week.ncaafPickCountRequired;
  if (existingCount >= required) {
    throw new Error(`${sportLeague} pick quota is already full.`);
  }
}

export function proposalSummary(proposals: LineProposal[], week: Week) {
  const memberProposals = proposals.filter((proposal) => proposal.proposalSource !== "admin_selected");
  const nfl = memberProposals.filter((proposal) => proposal.sportLeague === "NFL").length;
  const ncaaf = memberProposals.filter((proposal) => proposal.sportLeague === "NCAAF").length;
  return {
    NFL: { submitted: nfl, required: week.nflPickCountRequired, complete: nfl === week.nflPickCountRequired },
    NCAAF: { submitted: ncaaf, required: week.ncaafPickCountRequired, complete: ncaaf === week.ncaafPickCountRequired },
    complete: nfl === week.nflPickCountRequired && ncaaf === week.ncaafPickCountRequired
  };
}

export function validateProposalQuota(week: Week, sportLeague: SportLeague, currentProposals: LineProposal[], previousProposalId: string | undefined): void {
  const existingCount = currentProposals.filter((proposal) => proposal.proposalSource !== "admin_selected" && proposal.sportLeague === sportLeague && proposal.proposalId !== previousProposalId).length;
  const required = sportLeague === "NFL" ? week.nflPickCountRequired : week.ncaafPickCountRequired;
  if (existingCount >= required) {
    throw new Error(`${sportLeague} proposal limit is already full.`);
  }
}

export function responseResult(proposalResult: PickResult, stance: ProposalResponseStance): PickResult {
  if (proposalResult === "pending" || proposalResult === "push" || stance === "with") {
    return proposalResult;
  }
  return proposalResult === "win" ? "loss" : "win";
}

export function selfWithResponseForProposal(proposal: LineProposal): ProposalResponse {
  return {
    leagueId: proposal.leagueId,
    seasonId: proposal.seasonId,
    weekId: proposal.weekId,
    proposalId: proposal.proposalId,
    responderId: proposal.proposerId,
    stance: "with",
    submittedAt: proposal.submittedAt,
    result: proposal.result
  };
}

export function assertCanManuallyChangeProposalResponse(proposal: LineProposal, responderId: string): void {
  if (proposal.proposalSource !== "admin_selected" && proposal.proposerId === responderId) {
    throw new Error("You cannot respond to your own proposed line. Release the proposal instead.");
  }
}
