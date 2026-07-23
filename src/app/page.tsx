const games = [
  {
    id: "nfl-chi-gb",
    league: "NFL",
    away: "Green Bay",
    home: "Chicago",
    spread: "CHI +2.5",
    moneyline: "CHI +124 / GB -148",
    kickoff: "Sun 12:00 PM"
  },
  {
    id: "ncaaf-tex-ou",
    league: "NCAAF",
    away: "Texas",
    home: "Oklahoma",
    spread: "TEX -3.5",
    moneyline: "TEX -162 / OU +136",
    kickoff: "Sat 11:00 AM"
  },
  {
    id: "nfl-kc-lv",
    league: "NFL",
    away: "Las Vegas",
    home: "Kansas City",
    spread: "KC -6.5",
    moneyline: "KC -270 / LV +220",
    kickoff: "Sun 3:25 PM"
  }
];

const standings = [
  { name: "Grant", record: "18-10-2", winRate: "64%" },
  { name: "Maddie", record: "16-12-2", winRate: "57%" },
  { name: "Jake", record: "14-14-2", winRate: "50%" }
];

export default function HomePage() {
  return (
    <main className="min-h-screen bg-field">
      <section className="border-b border-ink/10 bg-ink text-chalk">
        <div className="mx-auto flex max-w-7xl flex-col gap-8 px-5 py-8 md:px-8">
          <nav className="flex items-center justify-between">
            <div className="text-lg font-semibold tracking-wide">Pickem Bot</div>
            <div className="flex items-center gap-3 text-sm text-chalk/75">
              <span>Week 1</span>
              <span className="rounded bg-gold px-2 py-1 text-xs font-semibold text-ink">Friday 10:00 AM CT Lock</span>
            </div>
          </nav>

          <div className="grid gap-8 lg:grid-cols-[1.2fr_0.8fr] lg:items-end">
            <div>
              <p className="mb-3 text-sm uppercase tracking-[0.22em] text-gold">Private football pickem</p>
              <h1 className="max-w-3xl text-4xl font-semibold leading-tight md:text-6xl">
                Tuesday opening lines. Friday locked picks. Season-long standings.
              </h1>
            </div>
            <div className="grid grid-cols-3 gap-3 text-center">
              <Metric label="Players" value="12" />
              <Metric label="Open Games" value="18" />
              <Metric label="Scrape" value="Tue" />
            </div>
          </div>
        </div>
      </section>

      <section className="mx-auto grid max-w-7xl gap-6 px-5 py-8 md:px-8 lg:grid-cols-[1fr_340px]">
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold">This Week's Board</h2>
            <button className="rounded bg-turf px-4 py-2 text-sm font-semibold text-white">Submit Picks</button>
          </div>

          <div className="overflow-hidden rounded border border-ink/10 bg-white">
            <div className="grid grid-cols-[80px_1fr_140px_180px] border-b border-ink/10 bg-ink/5 px-4 py-3 text-sm font-semibold text-ink/70 max-md:hidden">
              <span>League</span>
              <span>Matchup</span>
              <span>Kickoff</span>
              <span>Opening Line</span>
            </div>
            {games.map((game) => (
              <article key={game.id} className="grid gap-3 border-b border-ink/10 px-4 py-4 last:border-b-0 md:grid-cols-[80px_1fr_140px_180px] md:items-center">
                <span className="w-fit rounded bg-turf/10 px-2 py-1 text-xs font-bold text-turf">{game.league}</span>
                <div>
                  <div className="font-semibold">{game.away} at {game.home}</div>
                  <div className="text-sm text-ink/60">DraftKings Tuesday opening line</div>
                </div>
                <div className="text-sm text-ink/70">{game.kickoff}</div>
                <div className="text-sm">
                  <div className="font-semibold">{game.spread}</div>
                  <div className="text-ink/60">{game.moneyline}</div>
                </div>
              </article>
            ))}
          </div>
        </div>

        <aside className="space-y-4">
          <section className="rounded border border-ink/10 bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">Admin Queue</h2>
            <div className="space-y-3 text-sm">
              <StatusLine label="Tuesday scraper" value="Ready" />
              <StatusLine label="Manual review" value="2 games" />
              <StatusLine label="Submitted picks" value="8 / 12" />
              <StatusLine label="Results sync" value="Pending" />
            </div>
          </section>

          <section className="rounded border border-ink/10 bg-white p-4">
            <h2 className="mb-3 text-lg font-semibold">Standings</h2>
            <div className="space-y-3">
              {standings.map((row, index) => (
                <div key={row.name} className="grid grid-cols-[32px_1fr_auto] items-center gap-3 text-sm">
                  <span className="flex h-7 w-7 items-center justify-center rounded bg-gold/25 font-semibold">{index + 1}</span>
                  <div>
                    <div className="font-semibold">{row.name}</div>
                    <div className="text-ink/60">{row.record}</div>
                  </div>
                  <span className="font-semibold">{row.winRate}</span>
                </div>
              ))}
            </div>
          </section>
        </aside>
      </section>
    </main>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded border border-white/15 bg-white/10 p-4">
      <div className="text-2xl font-semibold">{value}</div>
      <div className="text-xs uppercase tracking-wide text-chalk/65">{label}</div>
    </div>
  );
}

function StatusLine({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between border-b border-ink/10 pb-2 last:border-b-0 last:pb-0">
      <span className="text-ink/60">{label}</span>
      <span className="font-semibold">{value}</span>
    </div>
  );
}
