import type { GameWithLines, Market } from "../lib/api";

export function LineText({ game, market }: { game: GameWithLines; market: Market }) {
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
      {game.awayTeam} {formatMoneyline(line.awayMoneyline)} / {game.homeTeam} {formatMoneyline(line.homeMoneyline)}
    </span>
  );
}

function formatSpread(value?: number): string {
  if (value === undefined) {
    return "--";
  }
  return value > 0 ? `+${value}` : `${value}`;
}

function formatMoneyline(value?: number): string {
  if (value === undefined) {
    return "--";
  }
  return value > 0 ? `+${value}` : `${value}`;
}
