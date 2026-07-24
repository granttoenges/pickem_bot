import type { GameWithOptions, Market } from "../lib/api";

export function LineText({ game, market }: { game: GameWithOptions; market: Market }) {
  const line = game.lines.find((item) => item.market === market);
  if (!line) {
    return <span className="text-ink/50">No {market} line</span>;
  }
  if (market === "spread") {
    return (
      <span>
        {game.awayTeam} {formatSpread(line.awaySpread)} / {game.homeTeam} {formatSpread(line.homeSpread)}
      </span>
    );
  }
  return (
    <span>
      {game.awayTeam} total {formatSpread(line.awayTeamTotal)} / {game.homeTeam} total {formatSpread(line.homeTeamTotal)}
    </span>
  );
}

function formatSpread(value?: number): string {
  if (value === undefined) {
    return "--";
  }
  return value > 0 ? `+${value}` : `${value}`;
}
