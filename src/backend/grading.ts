import type { Game, GradedPick, OpeningLine, PlayerPick } from "./types";

export function gradePick(game: Game, line: OpeningLine, pick: PlayerPick): GradedPick {
  if (game.status !== "final" || game.homeScore === undefined || game.awayScore === undefined) {
    throw new Error("Game is not final.");
  }

  const selectedIsHome = pick.team === game.homeTeam;
  const selectedScore = selectedIsHome ? game.homeScore : game.awayScore;

  if (pick.market === "team_total") {
    const total = selectedIsHome ? line.homeTeamTotal : line.awayTeamTotal;
    if (total === undefined) {
      throw new Error("Missing team total for selected team.");
    }
    if (selectedScore > total) {
      return { ...pick, result: pick.side === "over" ? "win" : "loss" };
    }
    if (selectedScore < total) {
      return { ...pick, result: pick.side === "under" ? "win" : "loss" };
    }
    return { ...pick, result: "push" };
  }

  const opponentScore = selectedIsHome ? game.awayScore : game.homeScore;
  const spread = selectedIsHome ? line.homeSpread : line.awaySpread;
  if (spread === undefined) {
    throw new Error("Missing spread for selected team.");
  }

  const adjustedMargin = selectedScore + spread - opponentScore;

  if (adjustedMargin > 0) {
    return { ...pick, result: "win" };
  }
  if (adjustedMargin < 0) {
    return { ...pick, result: "loss" };
  }
  return { ...pick, result: "push" };
}
