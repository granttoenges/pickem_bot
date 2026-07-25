import type { GameWithOptions, PickClaim, PickOption } from "../lib/api";
import { TeamLogo } from "./TeamLogo";

type Mode = "claim" | "summary";

export function GameOddsBoard({
  game,
  claims = [],
  userOptionIds = new Set<string>(),
  locked = false,
  mode = "claim",
  onPick
}: {
  game: GameWithOptions;
  claims?: PickClaim[];
  userOptionIds?: Set<string>;
  locked?: boolean;
  mode?: Mode;
  onPick?: (option: PickOption) => void;
}) {
  const claimByOption = new Map(claims.map((claim) => [claim.optionId, claim]));
  const awaySpread = findOption(game, "away-spread");
  const homeSpread = findOption(game, "home-spread");
  const awayOver = findOption(game, "away-total-over");
  const awayUnder = findOption(game, "away-total-under");
  const homeOver = findOption(game, "home-total-over");
  const homeUnder = findOption(game, "home-total-under");

  return (
    <article className="w-full overflow-hidden rounded-md border border-ink/10 bg-white text-ink shadow-sm">
      <header className="border-b border-ink/10 bg-field px-4 py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded bg-ink px-3 py-1 text-xs font-extrabold tracking-wide text-white">{game.sportLeague}</span>
          <span className="text-xs font-semibold text-ink/50">{new Date(game.kickoffAt).toLocaleString()}</span>
        </div>
        <div className="mt-4 grid grid-cols-[1fr_42px_1fr] items-center gap-3 text-center">
          <TeamHeader teamName={game.awayTeam} />
          <span className="mx-auto rounded-full bg-ink/5 px-2 py-1 text-[10px] font-bold uppercase text-ink/50">at</span>
          <TeamHeader teamName={game.homeTeam} />
        </div>
        {game.adminNote ? <p className="mt-3 text-center text-xs text-ink/55">{game.adminNote}</p> : null}
      </header>

      <div className="overflow-x-auto">
        <div className="min-w-[520px]">
          <div className="grid grid-cols-[minmax(220px,1fr)_minmax(132px,180px)_minmax(180px,240px)] border-b border-ink/10 bg-ink/5 px-3 py-3 text-[11px] font-extrabold uppercase tracking-wide text-ink/55">
            <span>Game</span>
            <span className="text-center">Spread</span>
            <span className="text-center">Team Total</span>
          </div>
          <TeamMarketRow
            teamName={game.awayTeam}
            spread={awaySpread}
            over={awayOver}
            under={awayUnder}
            claimByOption={claimByOption}
            userOptionIds={userOptionIds}
            locked={locked}
            mode={mode}
            onPick={onPick}
          />
          <TeamMarketRow
            teamName={game.homeTeam}
            spread={homeSpread}
            over={homeOver}
            under={homeUnder}
            claimByOption={claimByOption}
            userOptionIds={userOptionIds}
            locked={locked}
            mode={mode}
            onPick={onPick}
          />
        </div>
      </div>
    </article>
  );
}

function TeamHeader({ teamName }: { teamName: string }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-2">
      <TeamLogo teamName={teamName} />
      <span className="max-w-full truncate text-[11px] font-extrabold uppercase tracking-wide text-ink/70">{teamName}</span>
    </div>
  );
}

function TeamMarketRow({
  teamName,
  spread,
  over,
  under,
  claimByOption,
  userOptionIds,
  locked,
  mode,
  onPick
}: {
  teamName: string;
  spread?: PickOption;
  over?: PickOption;
  under?: PickOption;
  claimByOption: Map<string, PickClaim>;
  userOptionIds: Set<string>;
  locked: boolean;
  mode: Mode;
  onPick?: (option: PickOption) => void;
}) {
  return (
    <div className="grid min-h-[72px] grid-cols-[minmax(220px,1fr)_minmax(132px,180px)_minmax(180px,240px)] items-stretch border-b border-ink/10 last:border-b-0">
      <div className="flex min-w-0 items-center gap-3 px-3 py-3">
        <TeamLogo teamName={teamName} size="sm" />
        <span className="min-w-0 truncate text-sm font-bold text-ink">{teamName}</span>
      </div>
      <OptionCell option={spread} claimByOption={claimByOption} userOptionIds={userOptionIds} locked={locked} mode={mode} onPick={onPick} />
      <div className="grid grid-cols-2 gap-px border-l border-ink/10 bg-ink/10 p-px">
        <OptionCell option={over} claimByOption={claimByOption} userOptionIds={userOptionIds} locked={locked} mode={mode} onPick={onPick} compact />
        <OptionCell option={under} claimByOption={claimByOption} userOptionIds={userOptionIds} locked={locked} mode={mode} onPick={onPick} compact />
      </div>
    </div>
  );
}

function OptionCell({
  option,
  claimByOption,
  userOptionIds,
  locked,
  mode,
  onPick,
  compact = false
}: {
  option?: PickOption;
  claimByOption: Map<string, PickClaim>;
  userOptionIds: Set<string>;
  locked: boolean;
  mode: Mode;
  onPick?: (option: PickOption) => void;
  compact?: boolean;
}) {
  if (!option) {
    return (
      <div className={`flex items-center justify-center border-l border-ink/10 bg-ink/5 px-2 text-sm font-bold text-ink/30 ${compact ? "border-l-0" : ""}`}>
        --
      </div>
    );
  }

  const claim = claimByOption.get(option.optionId);
  const mine = userOptionIds.has(option.optionId);
  const disabled = mode === "summary" || locked || Boolean(claim && !mine);
  const label = option.market === "spread"
    ? formatSigned(option.lineValue)
    : `${option.side === "over" ? "O" : "U"} ${option.lineValue}`;

  return (
    <button
      className={`flex min-h-[70px] flex-col items-center justify-center border-l border-ink/10 px-2 text-center transition ${compact ? "min-h-0 border-l-0" : ""} ${cellClass(mine, disabled, mode)}`}
      disabled={disabled}
      type="button"
      onClick={() => onPick?.(option)}
    >
      <span className={`${compact ? "text-xs" : "text-sm"} font-extrabold leading-tight`}>{label}</span>
      <span className="mt-1 text-[10px] font-extrabold uppercase leading-none">{mine ? "Mine" : claim ? "Claimed" : mode === "summary" ? "Open" : "Pick"}</span>
    </button>
  );
}

function findOption(game: GameWithOptions, suffix: string): PickOption | undefined {
  return game.options.find((option) => option.optionId.endsWith(suffix));
}

function cellClass(mine: boolean, disabled: boolean, mode: Mode): string {
  if (mine) {
    return "bg-gold/20 text-ink ring-2 ring-inset ring-gold/50";
  }
  if (disabled && mode !== "summary") {
    return "cursor-not-allowed bg-ink/5 text-ink/30";
  }
  if (mode === "summary") {
    return "bg-white text-ink/60";
  }
  return "bg-white text-turf hover:bg-turf/5 active:bg-turf/10";
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}
