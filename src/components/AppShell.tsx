"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { getStoredSession, logout } from "../lib/auth";

export function AppShell({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const session = typeof window !== "undefined" ? getStoredSession() : undefined;
  return (
    <main className="min-h-screen bg-field text-ink">
      <header className="border-b border-ink/10 bg-ink text-chalk">
        <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-4 px-5 py-4 md:px-8">
          <Link href="/" className="text-lg font-semibold">Pickem Bot</Link>
          <nav className="flex flex-wrap items-center gap-2 text-sm">
            <Link className="rounded px-3 py-2 hover:bg-white/10" href="/">Board</Link>
            <Link className="rounded px-3 py-2 hover:bg-white/10" href="/standings">Standings</Link>
            {session?.groups.includes("admin") ? <Link className="rounded px-3 py-2 hover:bg-white/10" href="/admin">Admin</Link> : null}
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
