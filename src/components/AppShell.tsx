"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import { getStoredSession, logout, SessionState } from "../lib/auth";
import { applyThemePreference, getStoredThemePreference, storeThemePreference, ThemePreference, watchSystemTheme } from "../lib/theme";
import { cn } from "./ui/polish";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
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
      <header className="sticky top-0 z-40 border-b border-ink/10 bg-ink/95 text-chalk shadow-sm backdrop-blur dark:border-white/10 dark:bg-zinc-900/95">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8">
          <Link href="/" className="group flex items-center gap-2 text-lg font-semibold">
            <span className="h-2.5 w-2.5 rounded-full bg-gold shadow-[0_0_18px_rgba(214,166,68,0.75)] transition group-hover:scale-110" />
            Pickem Bot
          </Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link className={navClass(pathname === "/")} href="/">Board</Link>
            <Link className={navClass(pathname === "/standings")} href="/standings">Standings</Link>
            {session?.groups.some((group) => group === "admin" || group === "super_admin") ? <Link className={navClass(pathname === "/admin")} href="/admin">Admin</Link> : null}
            <div className="flex rounded-md border border-white/15 bg-white/5 p-1 shadow-inner">
              {(["system", "light", "dark"] as ThemePreference[]).map((preference) => (
                <button
                  key={preference}
                  className={`rounded px-2 py-1 text-xs font-semibold capitalize transition ${themePreference === preference ? "bg-gold text-ink shadow-sm" : "text-chalk/75 hover:bg-white/10 hover:text-white"}`}
                  type="button"
                  onClick={() => changeTheme(preference)}
                >
                  {preference}
                </button>
              ))}
            </div>
            {session ? (
              <button
                className="rounded-md bg-gold px-3 py-2 font-semibold text-ink shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
                onClick={() => {
                  logout();
                  router.push("/login");
                }}
              >
                Sign out
              </button>
            ) : (
              <Link className="rounded-md bg-gold px-3 py-2 font-semibold text-ink shadow-sm transition hover:-translate-y-0.5 hover:shadow-md" href="/login">Login</Link>
            )}
          </nav>
        </div>
      </header>
      {children}
    </main>
  );
}

function navClass(active: boolean): string {
  return cn(
    "rounded-md px-3 py-2 font-semibold transition",
    active ? "bg-white text-ink shadow-sm" : "text-chalk/80 hover:bg-white/10 hover:text-white"
  );
}
