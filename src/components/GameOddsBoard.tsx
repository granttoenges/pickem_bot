import type { GameWithOptions, PickClaim, PickOption } from "../lib/api";
import { TeamLogo } from "./TeamLogo";

type Mode = "claim" | "summary" | "admin_select";

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
  const gameOver = findOption(game, "game-total-over");
  const gameUnder = findOption(game, "game-total-under");

  return (
    <article className="w-full overflow-hidden rounded-md border border-ink/15 bg-white text-ink shadow-md ring-1 ring-ink/5">
      <header className="border-b border-ink/15 bg-field px-3 py-3 sm:px-4 sm:py-4">
        <div className="flex items-center justify-between gap-3">
          <span className="rounded bg-ink px-3 py-1 text-xs font-extrabold tracking-wide text-white">{game.sportLeague}</span>
          <span className="text-xs font-semibold text-ink/50">{new Date(game.kickoffAt).toLocaleString()}</span>
        </div>
        <div className="mt-3 grid grid-cols-[1fr_36px_1fr] items-center gap-2 text-center sm:mt-4 sm:grid-cols-[1fr_42px_1fr] sm:gap-3">
          <TeamHeader teamName={game.awayTeam} />
          <span className="mx-auto rounded-full bg-ink/5 px-2 py-1 text-[10px] font-bold uppercase text-ink/50">at</span>
          <TeamHeader teamName={game.homeTeam} />
        </div>
        {game.adminNote ? <p className="mt-3 text-center text-xs text-ink/55">{game.adminNote}</p> : null}
      </header>

      <div>
        <div>
          <div className="grid grid-cols-[minmax(74px,1fr)_minmax(50px,64px)_minmax(50px,64px)_minmax(50px,64px)_minmax(54px,70px)] border-b border-ink/15 bg-ink/5 text-[9px] font-extrabold uppercase tracking-wide text-ink/55 sm:grid-cols-[minmax(220px,1fr)_minmax(132px,180px)_minmax(90px,120px)_minmax(90px,120px)_minmax(132px,180px)] sm:text-[11px]">
            <span className="px-2 py-2 sm:px-3 sm:py-3">Game</span>
            <span className="px-1 py-2 text-center sm:px-3 sm:py-3">Spread</span>
            <span className="col-span-2 px-1 py-2 text-center sm:px-3 sm:py-3">Team Total</span>
            <span className="px-1 py-2 text-center sm:px-3 sm:py-3">Game Total</span>
          </div>
          <TeamMarketRow
            teamName={game.awayTeam}
            spread={awaySpread}
            over={awayOver}
            under={awayUnder}
            gameTotal={gameOver}
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
            gameTotal={gameUnder}
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
      <TeamLogo teamName={teamName} size="sm" />
      <span className="max-w-full truncate text-[10px] font-extrabold uppercase tracking-wide text-ink/70 sm:text-[11px]">{teamName}</span>
    </div>
  );
}

function TeamMarketRow({
  teamName,
  spread,
  over,
  under,
  gameTotal,
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
  gameTotal?: PickOption;
  claimByOption: Map<string, PickClaim>;
  userOptionIds: Set<string>;
  locked: boolean;
  mode: Mode;
  onPick?: (option: PickOption) => void;
}) {
  return (
    <div className="grid min-h-[58px] grid-cols-[minmax(74px,1fr)_minmax(50px,64px)_minmax(50px,64px)_minmax(50px,64px)_minmax(54px,70px)] items-stretch border-b border-ink/15 last:border-b-0 sm:min-h-[72px] sm:grid-cols-[minmax(220px,1fr)_minmax(132px,180px)_minmax(90px,120px)_minmax(90px,120px)_minmax(132px,180px)]">
      <div className="flex min-w-0 items-center gap-1 px-1.5 py-2 sm:gap-3 sm:px-3 sm:py-3">
        <TeamLogo teamName={teamName} size="sm" />
        <span className="min-w-0 truncate text-[11px] font-bold text-ink sm:text-sm">{teamName}</span>
      </div>
      <OptionCell option={spread} claimByOption={claimByOption} userOptionIds={userOptionIds} locked={locked} mode={mode} onPick={onPick} />
      <OptionCell option={over} claimByOption={claimByOption} userOptionIds={userOptionIds} locked={locked} mode={mode} onPick={onPick} compact />
      <OptionCell option={under} claimByOption={claimByOption} userOptionIds={userOptionIds} locked={locked} mode={mode} onPick={onPick} compact />
      <OptionCell option={gameTotal} claimByOption={claimByOption} userOptionIds={userOptionIds} locked={locked} mode={mode} onPick={onPick} compact />
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
      <div className="flex items-center justify-center border-l border-ink/15 bg-ink/5 px-1 text-sm font-bold text-ink/30 sm:px-2">
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
      className={`flex min-h-[58px] flex-col items-center justify-center gap-1 border-l border-ink/15 px-1 text-center transition sm:min-h-[70px] sm:px-2 ${cellClass(mine, disabled, mode)}`}
      disabled={disabled}
      type="button"
      onClick={() => onPick?.(option)}
    >
      <span className={`${compact ? "text-[11px] sm:text-xs" : "text-xs sm:text-sm"} font-bold leading-none`}>{label}</span>
      <span className="text-[9px] font-bold uppercase leading-none sm:text-[10px]">{actionLabel({ mine, claim: Boolean(claim), mode })}</span>
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

function actionLabel({ mine, claim, mode }: { mine: boolean; claim: boolean; mode: Mode }): string {
  if (mine) {
    return mode === "admin_select" ? "Selected" : "Mine";
  }
  if (claim) {
    return "Claimed";
  }
  if (mode === "summary") {
    return "Open";
  }
  return mode === "admin_select" ? "Add" : "Pick";
}

function formatSigned(value: number): string {
  return value > 0 ? `+${value}` : `${value}`;
}
