import type { PlayerPick, SportLeague, Week } from "./types";

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
