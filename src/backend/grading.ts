import type { Game, GradedPick, OpeningLine, PlayerPick } from "./types";

export function gradePick(game: Game, line: OpeningLine, pick: PlayerPick): GradedPick {
  if (game.status !== "final" || game.homeScore === undefined || game.awayScore === undefined) {
    throw new Error("Game is not final.");
  }

  if (pick.market === "moneyline") {
    const winner = game.homeScore > game.awayScore ? game.homeTeam : game.awayScore > game.homeScore ? game.awayTeam : undefined;
    return { ...pick, result: winner === undefined ? "push" : winner === pick.selectedTeam ? "win" : "loss" };
  }

  const selectedIsHome = pick.selectedTeam === game.homeTeam;
  const selectedScore = selectedIsHome ? game.homeScore : game.awayScore;
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
