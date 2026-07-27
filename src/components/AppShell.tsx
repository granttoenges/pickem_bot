"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getStoredSession, logout, SessionState } from "../lib/auth";
import { applyThemePreference, getStoredThemePreference, storeThemePreference, ThemePreference, watchSystemTheme } from "../lib/theme";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [session, setSession] = useState<SessionState>();
  const [themePreference, setThemePreference] = useState<ThemePreference>("system");

  useEffect(() => {
    setSession(getStoredSession());
    const preference = getStoredThemePreference();
    setThemePreference(preference);
    applyThemePreference(preference);
  }, []);

  useEffect(() => watchSystemTheme(themePreference, () => setThemePreference(getStoredThemePreference())), [themePreference]);

  function changeTheme(preference: ThemePreference) {
    setThemePreference(preference);
    storeThemePreference(preference);
  }

  return (
    <main className="min-h-screen bg-field text-ink transition-colors dark:bg-zinc-950 dark:text-zinc-100">
      <header className="border-b border-ink/10 bg-ink text-chalk dark:border-white/10 dark:bg-zinc-900">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8">
          <Link href="/" className="text-lg font-semibold">Pickem Bot</Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link className="rounded px-3 py-2 hover:bg-white/10" href="/">Board</Link>
            <Link className="rounded px-3 py-2 hover:bg-white/10" href="/standings">Standings</Link>
            {session?.groups.some((group) => group === "admin" || group === "super_admin") ? <Link className="rounded px-3 py-2 hover:bg-white/10" href="/admin">Admin</Link> : null}
            <div className="flex rounded border border-white/15 bg-white/5 p-1">
              {(["system", "light", "dark"] as ThemePreference[]).map((preference) => (
                <button
                  key={preference}
                  className={`rounded px-2 py-1 text-xs font-semibold capitalize transition ${themePreference === preference ? "bg-gold text-ink" : "text-chalk/75 hover:bg-white/10 hover:text-white"}`}
                  type="button"
                  onClick={() => changeTheme(preference)}
                >
                  {preference}
                </button>
              ))}
            </div>
            {session ? (
              <button
                className="rounded bg-gold px-3 py-2 font-semibold text-ink"
                onClick={() => {
                  logout();
                  router.push("/login");
                }}
              >
                Sign out
              </button>
            ) : (
              <Link className="rounded bg-gold px-3 py-2 font-semibold text-ink" href="/login">Login</Link>
            )}
          </nav>
        </div>
      </header>
      {children}
    </main>
  );
}
