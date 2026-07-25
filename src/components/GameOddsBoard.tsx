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
  const moneyline = game.lines.find((line) => line.market === "moneyline");

  return (
    <article className="overflow-hidden rounded border border-ink/10 bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-ink/10 bg-ink px-4 py-3 text-white">
        <div>
          <span className="rounded bg-white/10 px-2 py-1 text-xs font-bold">{game.sportLeague}</span>
          <div className="mt-2 text-sm text-white/70">{new Date(game.kickoffAt).toLocaleString()}</div>
        </div>
        {game.adminNote ? <p className="text-sm text-white/70">{game.adminNote}</p> : null}
      </div>

      <div className="grid grid-cols-[minmax(150px,1fr)_minmax(92px,120px)_minmax(116px,150px)_minmax(96px,120px)] border-b border-ink/10 bg-ink/5 px-3 py-2 text-[11px] font-bold uppercase text-ink/50 max-sm:grid-cols-[minmax(130px,1fr)_82px_104px]">
        <span>Team</span>
        <span className="text-center">Spread</span>
        <span className="text-center">Team Total</span>
        <span className="text-center max-sm:hidden">Moneyline</span>
      </div>

      <TeamMarketRow
        teamName={game.awayTeam}
        spread={awaySpread}
        totalPrimary={awayOver}
        totalSecondary={awayUnder}
        moneyline={moneyline?.awayMoneyline}
        claimByOption={claimByOption}
        userOptionIds={userOptionIds}
        locked={locked}
        mode={mode}
        onPick={onPick}
      />
      <TeamMarketRow
        teamName={game.homeTeam}
        spread={homeSpread}
        totalPrimary={homeOver}
        totalSecondary={homeUnder}
        moneyline={moneyline?.homeMoneyline}
        claimByOption={claimByOption}
        userOptionIds={userOptionIds}
        locked={locked}
        mode={mode}
        onPick={onPick}
      />
    </article>
  );
}

function TeamMarketRow({
  teamName,
  spread,
  totalPrimary,
  totalSecondary,
  moneyline,
  claimByOption,
  userOptionIds,
  locked,
  mode,
  onPick
}: {
  teamName: string;
  spread?: PickOption;
  totalPrimary?: PickOption;
  totalSecondary?: PickOption;
  moneyline?: number;
  claimByOption: Map<string, PickClaim>;
  userOptionIds: Set<string>;
  locked: boolean;
  mode: Mode;
  onPick?: (option: PickOption) => void;
}) {
  return (
    <div className="grid min-h-[74px] grid-cols-[minmax(150px,1fr)_minmax(92px,120px)_minmax(116px,150px)_minmax(96px,120px)] items-stretch border-b border-ink/10 last:border-b-0 max-sm:grid-cols-[minmax(130px,1fr)_82px_104px]">
      <div className="flex min-w-0 items-center gap-3 px-3 py-3">
        <TeamLogo teamName={teamName} size="sm" />
        <span className="min-w-0 truncate text-sm font-semibold">{teamName}</span>
      </div>
      <OptionCell option={spread} claimByOption={claimByOption} userOptionIds={userOptionIds} locked={locked} mode={mode} onPick={onPick} />
      <div className="grid grid-rows-2 border-l border-ink/10">
        <OptionCell option={totalPrimary} claimByOption={claimByOption} userOptionIds={userOptionIds} locked={locked} mode={mode} onPick={onPick} compact />
        <OptionCell option={totalSecondary} claimByOption={claimByOption} userOptionIds={userOptionIds} locked={locked} mode={mode} onPick={onPick} compact />
      </div>
      <div className="flex items-center justify-center border-l border-ink/10 bg-ink/[0.03] px-2 text-sm font-bold text-turf max-sm:hidden">
        {formatMoneyline(moneyline)}
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
      <div className={`flex items-center justify-center border-l border-ink/10 bg-ink/[0.02] px-2 text-xs text-ink/35 ${compact ? "min-h-[36px]" : ""}`}>
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
      className={`flex min-h-[36px] flex-col items-center justify-center border-l border-ink/10 px-2 py-2 text-center text-xs transition ${cellClass(mine, disabled, mode)}`}
      disabled={disabled}
      type="button"
      onClick={() => onPick?.(option)}
    >
      <span className="text-sm font-bold">{label}</span>
      <span className="mt-0.5 text-[10px] font-semibold uppercase">{mine ? "Mine" : claim ? "Claimed" : mode === "summary" ? "Open" : "Pick"}</span>
    </button>
  );
}

function findOption(game: GameWithOptions, suffix: string): PickOption | undefined {
  return game.options.find((option) => option.optionId.endsWith(suffix));
}

function cellClass(mine: boolean, disabled: boolean, mode: Mode): string {
  if (mine) {
    return "bg-gold/25 text-ink ring-2 ring-inset ring-gold/60";
  }
  if (disabled && mode !== "summary") {
    return "cursor-not-allowed bg-ink/5 text-ink/30";
  }
  if (mode === "summary") {
    return "bg-white text-ink/70";
  }
  return "bg-white text-turf hover:bg-turf/10";
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}

function formatMoneyline(value?: number): string {
  if (value === undefined) {
    return "--";
  }
  return value > 0 ? `+${value}` : `${value}`;
}
