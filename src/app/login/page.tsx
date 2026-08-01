"use client";

import { FormEvent, useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  completeNewPassword,
  confirmPasswordReset,
  destinationAfterLogin,
  getStoredSession,
  login,
  requestPasswordReset
} from "../../lib/auth";
import {
  friendlyPasswordError,
  friendlyPasswordResetError,
  friendlyPasswordResetRequestError,
  isValidPassword,
  passwordsMatch,
  passwordRequirements
} from "../../lib/passwordPolicy";
import { BorderBeam, FadeContent, MagicCard, ShimmerButton } from "../../components/ui/polish";

type LoginMode = "signIn" | "newPassword" | "forgotRequest" | "forgotConfirm";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [newPasswordConfirmation, setNewPasswordConfirmation] = useState("");
  const [resetCode, setResetCode] = useState("");
  const [mode, setMode] = useState<LoginMode>("signIn");
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState("");
  const [nextPath, setNextPath] = useState<string | null>(null);
  const requirements = passwordRequirements(newPassword);
  const resetPasswordsMatch = passwordsMatch(newPassword, newPasswordConfirmation);
  const canSetPassword = isValidPassword(newPassword) && (mode !== "forgotConfirm" || resetPasswordsMatch);

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
    setBusy(true);
    setStatus("Signing in...");
    try {
      const normalizedEmail = email.trim();
      setEmail(normalizedEmail);
      const session = await login(normalizedEmail, password);
      if ("challenge" in session) {
        setMode("newPassword");
        setStatus("Choose a new password to finish activating your account.");
        return;
      }
      router.push(destinationAfterLogin(session, nextPath));
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Login failed.");
    } finally {
      setBusy(false);
    }
  }

  async function submitNewPassword(event: FormEvent) {
    event.preventDefault();
    if (!canSetPassword) {
      setStatus("Password does not meet the requirements below.");
      return;
    }
    setBusy(true);
    setStatus("Setting password...");
    try {
      const session = await completeNewPassword(newPassword, email);
      router.push(destinationAfterLogin(session, nextPath));
    } catch (error) {
      setStatus(friendlyPasswordError(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitForgotRequest(event: FormEvent) {
    event.preventDefault();
    const normalizedEmail = email.trim();
    setEmail(normalizedEmail);
    setBusy(true);
    setStatus("Requesting a reset code...");
    try {
      await requestPasswordReset(normalizedEmail);
      setMode("forgotConfirm");
      setStatus("If an eligible account exists, a reset code was sent.");
    } catch (error) {
      setStatus(friendlyPasswordResetRequestError(error));
    } finally {
      setBusy(false);
    }
  }

  async function resendResetCode() {
    setBusy(true);
    setStatus("Requesting another reset code...");
    try {
      await requestPasswordReset(email.trim());
      setStatus("If an eligible account exists, a new reset code was sent.");
    } catch (error) {
      setStatus(friendlyPasswordResetRequestError(error));
    } finally {
      setBusy(false);
    }
  }

  async function submitPasswordReset(event: FormEvent) {
    event.preventDefault();
    if (!resetCode.trim()) {
      setStatus("Enter the verification code from your email.");
      return;
    }
    if (!isValidPassword(newPassword)) {
      setStatus("Password does not meet the requirements below.");
      return;
    }
    if (!resetPasswordsMatch) {
      setStatus("New passwords do not match.");
      return;
    }
    setBusy(true);
    setStatus("Resetting password...");
    try {
      await confirmPasswordReset(email.trim(), resetCode.trim(), newPassword);
      setMode("signIn");
      setPassword("");
      setResetCode("");
      setNewPassword("");
      setNewPasswordConfirmation("");
      setStatus("Password reset. Sign in with your new password.");
    } catch (error) {
      setStatus(friendlyPasswordResetError(error));
    } finally {
      setBusy(false);
    }
  }

  function beginForgotPassword() {
    setMode("forgotRequest");
    clearSensitiveFields();
    setStatus("");
  }

  function returnToSignIn() {
    setMode("signIn");
    clearSensitiveFields();
    setStatus("");
  }

  function clearSensitiveFields() {
    setPassword("");
    setResetCode("");
    setNewPassword("");
    setNewPasswordConfirmation("");
  }

  const submitHandler = mode === "signIn"
    ? submit
    : mode === "newPassword"
      ? submitNewPassword
      : mode === "forgotRequest"
        ? submitForgotRequest
        : submitPasswordReset;

  return (
    <main className="grid min-h-screen place-items-center bg-ink px-5 text-chalk dark:bg-zinc-950">
      <FadeContent className="w-full max-w-sm">
        <MagicCard as="form" className="relative w-full overflow-hidden border-white/15 bg-white/10 p-6 text-chalk shadow-2xl backdrop-blur dark:bg-zinc-900/85" onSubmit={submitHandler}>
          <BorderBeam />
          <div className="mb-1 flex items-center gap-2">
            <span className="h-2.5 w-2.5 rounded-full bg-gold shadow-[0_0_18px_rgba(214,166,68,0.75)]" />
            <h1 className="text-3xl font-semibold">Pickem Bot</h1>
          </div>
          <p className="mt-2 text-sm text-chalk/65">Invite-only league login.</p>

          {mode === "signIn" ? (
            <>
              <label className="mt-6 block text-sm font-semibold" htmlFor="email">Email</label>
              <input id="email" type="email" autoComplete="email" required className="mt-2 w-full rounded border border-white/20 bg-white px-3 py-2 text-ink dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100" value={email} onChange={(event) => setEmail(event.target.value)} />
              <label className="mt-4 block text-sm font-semibold" htmlFor="password">Password</label>
              <input id="password" type="password" autoComplete="current-password" required className="mt-2 w-full rounded border border-white/20 bg-white px-3 py-2 text-ink dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100" value={password} onChange={(event) => setPassword(event.target.value)} />
              <button className="mt-3 text-sm font-semibold text-gold underline-offset-4 hover:underline" type="button" onClick={beginForgotPassword}>Forgot password?</button>
              <ShimmerButton className="mt-6 w-full bg-gold text-ink dark:bg-gold dark:text-ink" disabled={busy} type="submit">{busy ? "Signing in..." : "Sign in"}</ShimmerButton>
            </>
          ) : mode === "newPassword" ? (
            <>
              <label className="mt-6 block text-sm font-semibold" htmlFor="newPassword">New password</label>
              <input id="newPassword" type="password" autoComplete="new-password" className="mt-2 w-full rounded border border-white/20 bg-white px-3 py-2 text-ink dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              <PasswordRequirements requirements={requirements} />
              <ShimmerButton className="mt-6 w-full bg-gold text-ink disabled:bg-white/20 disabled:text-chalk/45 dark:bg-gold dark:text-ink" disabled={!canSetPassword || busy} type="submit">{busy ? "Setting password..." : "Set password"}</ShimmerButton>
            </>
          ) : mode === "forgotRequest" ? (
            <>
              <h2 className="mt-6 text-xl font-semibold">Reset your password</h2>
              <p className="mt-2 text-sm text-chalk/65">Enter your account email and we&apos;ll send a verification code if it is eligible for recovery.</p>
              <label className="mt-4 block text-sm font-semibold" htmlFor="resetEmail">Email</label>
              <input id="resetEmail" type="email" autoComplete="email" required className="mt-2 w-full rounded border border-white/20 bg-white px-3 py-2 text-ink dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100" value={email} onChange={(event) => setEmail(event.target.value)} />
              <ShimmerButton className="mt-6 w-full bg-gold text-ink dark:bg-gold dark:text-ink" disabled={busy} type="submit">{busy ? "Sending..." : "Send reset code"}</ShimmerButton>
              <button className="mt-4 w-full text-sm font-semibold text-gold underline-offset-4 hover:underline" type="button" onClick={returnToSignIn}>Back to sign in</button>
            </>
          ) : (
            <>
              <h2 className="mt-6 text-xl font-semibold">Enter your reset code</h2>
              <p className="mt-2 text-sm text-chalk/65">Use the code sent for {email}. Codes expire after one hour.</p>
              <label className="mt-4 block text-sm font-semibold" htmlFor="resetCode">Verification code</label>
              <input id="resetCode" type="text" inputMode="numeric" autoComplete="one-time-code" required className="mt-2 w-full rounded border border-white/20 bg-white px-3 py-2 text-ink dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100" value={resetCode} onChange={(event) => setResetCode(event.target.value)} />
              <label className="mt-4 block text-sm font-semibold" htmlFor="resetNewPassword">New password</label>
              <input id="resetNewPassword" type="password" autoComplete="new-password" className="mt-2 w-full rounded border border-white/20 bg-white px-3 py-2 text-ink dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100" value={newPassword} onChange={(event) => setNewPassword(event.target.value)} />
              <label className="mt-4 block text-sm font-semibold" htmlFor="resetPasswordConfirmation">Confirm new password</label>
              <input id="resetPasswordConfirmation" type="password" autoComplete="new-password" className="mt-2 w-full rounded border border-white/20 bg-white px-3 py-2 text-ink dark:border-white/15 dark:bg-zinc-950 dark:text-zinc-100" value={newPasswordConfirmation} onChange={(event) => setNewPasswordConfirmation(event.target.value)} />
              {newPasswordConfirmation && !resetPasswordsMatch ? <p className="mt-2 text-xs text-red-200">New passwords do not match.</p> : null}
              <PasswordRequirements requirements={requirements} />
              <ShimmerButton className="mt-6 w-full bg-gold text-ink disabled:bg-white/20 disabled:text-chalk/45 dark:bg-gold dark:text-ink" disabled={!resetCode.trim() || !canSetPassword || busy} type="submit">{busy ? "Resetting..." : "Reset password"}</ShimmerButton>
              <div className="mt-4 flex flex-wrap justify-between gap-3 text-sm font-semibold text-gold">
                <button className="underline-offset-4 hover:underline disabled:opacity-50" disabled={busy} type="button" onClick={() => void resendResetCode()}>Resend code</button>
                <button className="underline-offset-4 hover:underline" type="button" onClick={returnToSignIn}>Back to sign in</button>
              </div>
              <p className="mt-3 text-xs text-chalk/55">If no email arrives, contact your league administrator.</p>
            </>
          )}
          {status ? <p className="mt-4 text-sm text-chalk/75" aria-live="polite">{status}</p> : null}
        </MagicCard>
      </FadeContent>
    </main>
  );
}

function PasswordRequirements({ requirements }: { requirements: ReturnType<typeof passwordRequirements> }) {
  return (
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
  );
}
