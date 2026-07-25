const teamLogos: Record<string, string> = {
  Packers: "https://a.espncdn.com/i/teamlogos/nfl/500/gb.png",
  Bears: "https://a.espncdn.com/i/teamlogos/nfl/500/chi.png",
  Chiefs: "https://a.espncdn.com/i/teamlogos/nfl/500/kc.png",
  Broncos: "https://a.espncdn.com/i/teamlogos/nfl/500/den.png",
  Cowboys: "https://a.espncdn.com/i/teamlogos/nfl/500/dal.png",
  Eagles: "https://a.espncdn.com/i/teamlogos/nfl/500/phi.png",
  Bills: "https://a.espncdn.com/i/teamlogos/nfl/500/buf.png",
  Jets: "https://a.espncdn.com/i/teamlogos/nfl/500/nyj.png",
  Ravens: "https://a.espncdn.com/i/teamlogos/nfl/500/bal.png",
  Steelers: "https://a.espncdn.com/i/teamlogos/nfl/500/pit.png",
  "49ers": "https://a.espncdn.com/i/teamlogos/nfl/500/sf.png",
  Seahawks: "https://a.espncdn.com/i/teamlogos/nfl/500/sea.png",
  "Ohio State": "https://a.espncdn.com/i/teamlogos/ncaa/500/194.png",
  Michigan: "https://a.espncdn.com/i/teamlogos/ncaa/500/130.png",
  Georgia: "https://a.espncdn.com/i/teamlogos/ncaa/500/61.png",
  Alabama: "https://a.espncdn.com/i/teamlogos/ncaa/500/333.png",
  Texas: "https://a.espncdn.com/i/teamlogos/ncaa/500/251.png",
  Oklahoma: "https://a.espncdn.com/i/teamlogos/ncaa/500/201.png",
  "Notre Dame": "https://a.espncdn.com/i/teamlogos/ncaa/500/87.png",
  USC: "https://a.espncdn.com/i/teamlogos/ncaa/500/30.png",
  LSU: "https://a.espncdn.com/i/teamlogos/ncaa/500/99.png",
  Florida: "https://a.espncdn.com/i/teamlogos/ncaa/500/57.png",
  "Penn State": "https://a.espncdn.com/i/teamlogos/ncaa/500/213.png",
  Oregon: "https://a.espncdn.com/i/teamlogos/ncaa/500/2483.png"
};

export function TeamLogo({ teamName, size = "md" }: { teamName: string; size?: "sm" | "md" }) {
  const src = teamLogos[teamName];
  const dimensions = size === "sm" ? "h-8 w-8" : "h-11 w-11";
  const textSize = size === "sm" ? "text-[10px]" : "text-xs";

  if (!src) {
    return (
      <span className={`${dimensions} ${textSize} flex shrink-0 items-center justify-center rounded border border-ink/10 bg-ink/5 font-bold text-ink/60`}>
        {initials(teamName)}
      </span>
    );
  }

  return (
    <img
      alt={`${teamName} logo`}
      className={`${dimensions} shrink-0 rounded object-contain`}
      height={size === "sm" ? 32 : 44}
      src={src}
      width={size === "sm" ? 32 : 44}
    />
  );
}

function initials(teamName: string): string {
  return teamName
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join("");
}
