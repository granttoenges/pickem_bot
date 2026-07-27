"use client";

import { useEffect, useState } from "react";
import { requireSession, SessionState } from "../lib/auth";

export function AuthGuard({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<SessionState>();
  const [checking, setChecking] = useState(true);

  useEffect(() => {
    const currentPath = `${window.location.pathname}${window.location.search}`;
    const activeSession = requireSession(currentPath);
    setSession(activeSession);
    setChecking(false);
  }, []);

  if (checking || !session) {
    return (
      <main className="grid min-h-screen place-items-center bg-field px-5 text-ink dark:bg-zinc-950 dark:text-zinc-100">
        <div className="rounded border border-ink/10 bg-white px-4 py-3 text-sm font-semibold shadow-sm dark:border-white/10 dark:bg-zinc-900">
          Checking your session...
        </div>
      </main>
    );
  }

  return <>{children}</>;
}
