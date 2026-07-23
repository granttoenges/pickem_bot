"use client";

import { useEffect, useState } from "react";
import { AppShell } from "../../components/AppShell";
import { apiGet, Standing } from "../../lib/api";
import { appConfig } from "../../lib/config";

export default function StandingsPage() {
  const [standings, setStandings] = useState<Standing[]>([]);
  const [status, setStatus] = useState("Loading standings...");

  useEffect(() => {
    apiGet<{ standings: Standing[] }>(`/standings?seasonId=${encodeURIComponent(appConfig.seasonId)}`)
      .then((payload) => {
        setStandings(payload.standings);
        setStatus("");
      })
      .catch((error: Error) => setStatus(error.message));
  }, []);

  return (
    <AppShell>
      <section className="mx-auto max-w-4xl px-5 py-8 md:px-8">
        <h1 className="text-4xl font-semibold">Season Standings</h1>
        {status ? <div className="mt-4 rounded border border-ink/10 bg-white p-3 text-sm">{status}</div> : null}
        <div className="mt-6 overflow-hidden rounded border border-ink/10 bg-white">
          {standings.map((row, index) => (
            <div key={row.userId} className="grid grid-cols-[48px_1fr_90px_90px_90px] border-b border-ink/10 px-4 py-3 last:border-b-0">
              <span className="font-semibold">{index + 1}</span>
              <span>{row.displayName}</span>
              <span>{row.wins} W</span>
              <span>{row.losses} L</span>
              <span>{row.pushes} P</span>
            </div>
          ))}
          {!standings.length && !status ? <div className="p-6 text-ink/60">Standings will appear after picks are graded.</div> : null}
        </div>
      </section>
    </AppShell>
  );
}
