"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { completeNewPassword, destinationAfterLogin, getStoredSession, login } from "../../lib/auth";
import { friendlyPasswordError, isValidPassword, passwordRequirements } from "../../lib/passwordPolicy";
import { BorderBeam, FadeContent, MagicCard, ShimmerButton } from "../../components/ui/polish";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [needsNewPassword, setNeedsNewPassword] = useState(false);
  const [status, setStatus] = useState("");
  const [nextPath, setNextPath] = useState<string | null>(null);
  const requirements = passwordRequirements(newPassword);
  const canSetPassword = isValidPassword(newPassword);

  useEffect(() => {
    const next = new URLSearchParams(window.location.search).get("next");
    setNextPath(next);
    const session = getStoredSession();
    if (session) {
      router.replace(destinationAfterLogin(session, next));
    }
  }, [router]);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setStatus("Signing in...");
    try {
      const session = await login(email, password);
      if ("challenge" in session) {
        setNeedsNewPassword(true);
        setStatus("Choose a new password to finish activating your account.");
        return;
      }
      router.push(destinationAfterLogin(session, nextPath));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Login failed.");
    }
  }

  async function submitNewPassword(event: FormEvent) {
    event.preventDefault();
    if (!canSetPassword) {
      setStatus("Password does not meet the requirements below.");
      return;
    }
    setStatus("Setting password...");
    try {
      const session = await completeNewPassword(newPassword, email);
      router.push(destinationAfterLogin(session, nextPath));
    } catch (error) {
      setStatus(friendlyPasswordError(error));
    }
  }

  return (
    <main className="grid min-h-screen place-items-center bg-ink px-5 text-chalk dark:bg-zinc-950">
      <FadeContent className="w-full max-w-sm">
      <MagicCard as="form" className="relative w-full overflow-hidden border-white/15 bg-white/10 p-6 text-chalk shadow-2xl backdrop-blur dark:bg-zinc-900/85" onSubmit={needsNewPassword ? submitNewPassword : submit}>
        <BorderBeam />
        <div className="mb-1 flex items-center gap-2">
          <span className="h-2.5 w-2.5 rounded-full bg-gold shadow-[0_0_18px_rgba(214,166,68,0.75)]" />
          <h1 className="text-3xl font-semibold">Pickem Bot</h1>
        </div>
        <p className="mt-2 text-sm text-chalk/65">Invite-only league login.</p>
        {!needsNewPassword ? (
          <>
            <label className="mt-6 block text-sm font-semibold" htmlFor="email">Email</label>
            <input id="email" className="mt-2 w-full rounded border border-white/20 bg-white px-3 py-2 text-ink dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100" value={email} onChange={(event) => setEmail(event.target.value)} />
            <label className="mt-4 block text-sm font-semibold" htmlFor="password">Password</label>
            <input id="password" type="password" className="mt-2 w-full rounded border border-white/20 bg-white px-3 py-2 text-ink dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100" value={password} onChange={(event) => setPassword(event.target.value)} />
            <ShimmerButton className="mt-6 w-full bg-gold text-ink dark:bg-gold dark:text-ink" type="submit">Sign in</ShimmerButton>
          </>
        ) : (
          <>
            <label className="mt-6 block text-sm font-semibold" htmlFor="newPassword">New password</label>
            <input id="newPassword" type="password" className="mt-2 w-full rounded border border-white/20 bg-white px-3 py-2 text-ink dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
            <div className="mt-3 rounded border border-white/15 bg-white/5 p-3 text-xs text-chalk/75">
              <p className="font-semibold text-chalk">Password requirements</p>
              <ul className="mt-2 space-y-1">
                {requirements.map((requirement) => (
                  <li key={requirement.id} className={requirement.met ? "text-gold" : "text-chalk/70"}>
                    {requirement.met ? "Met: " : "Needed: "}{requirement.label}
                  </li>
                ))}
              </ul>
            </div>
            <ShimmerButton className="mt-6 w-full bg-gold text-ink disabled:bg-white/20 disabled:text-chalk/45 dark:bg-gold dark:text-ink" disabled={!canSetPassword} type="submit">Set password</ShimmerButton>
          </>
        )}
        {status ? <p className="mt-4 text-sm text-chalk/75">{status}</p> : null}
      </MagicCard>
      </FadeContent>
    </main>
  );
}
