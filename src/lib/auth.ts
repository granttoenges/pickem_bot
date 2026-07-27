"use client";

import {
  AuthenticationDetails,
  CognitoUser,
  CognitoUserPool,
  CognitoUserSession
} from "amazon-cognito-identity-js";
import { appConfig } from "./config";

const tokenKey = "pickem.idToken";
const emailKey = "pickem.email";
const sessionExpiredMessage = "Your session expired. Please sign in again.";

export interface SessionState {
  idToken: string;
  email: string;
  groups: string[];
}

export interface TokenPayload {
  email?: string;
  "cognito:groups"?: string[];
  exp?: number;
}

export interface NewPasswordRequiredState {
  challenge: "NEW_PASSWORD_REQUIRED";
  email: string;
}

let pendingPasswordUser: CognitoUser | undefined;

export function getStoredSession(): SessionState | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const sessionToken = window.sessionStorage.getItem(tokenKey);
  window.localStorage.removeItem(tokenKey);
  window.localStorage.removeItem(emailKey);
  const token = sessionToken;
  const email = window.sessionStorage.getItem(emailKey);
  if (!token || !email || isTokenExpired(token)) {
    clearStoredSession();
    return undefined;
  }
  return {
    idToken: token,
    email,
    groups: groupsFromToken(token)
  };
}

export function logout(): void {
  clearStoredSession();
}

export function clearStoredSession(): void {
  window.sessionStorage.removeItem(tokenKey);
  window.sessionStorage.removeItem(emailKey);
  window.localStorage.removeItem(tokenKey);
  window.localStorage.removeItem(emailKey);
  window.localStorage.removeItem("pickem.groups");
}

export function requireSession(currentPath?: string): SessionState | undefined {
  const session = getStoredSession();
  if (session) {
    return session;
  }
  redirectToLogin(currentPath);
  return undefined;
}

export function redirectToLogin(currentPath?: string): void {
  if (typeof window === "undefined") {
    return;
  }
  clearStoredSession();
  const next = currentPath ?? `${window.location.pathname}${window.location.search}`;
  const loginPath = `/login?next=${encodeURIComponent(next || "/")}`;
  window.location.assign(loginPath);
}

export function isSafeInternalPath(value: string | null | undefined): value is string {
  return Boolean(value) && value!.startsWith("/") && !value!.startsWith("//") && !value!.includes("://");
}

export function defaultRouteForSession(session: SessionState): string {
  return session.groups.some((group) => group === "admin" || group === "super_admin") ? "/admin" : "/";
}

export function destinationAfterLogin(session: SessionState, next?: string | null): string {
  return isSafeInternalPath(next) ? next : defaultRouteForSession(session);
}

export async function login(email: string, password: string): Promise<SessionState | NewPasswordRequiredState> {
  const userPool = getUserPool();
  const user = new CognitoUser({ Username: email, Pool: userPool });
  const details = new AuthenticationDetails({ Username: email, Password: password });

  return new Promise<SessionState | NewPasswordRequiredState>((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: (session) => resolve(persistSession(session, email)),
      onFailure: reject,
      newPasswordRequired: () => {
        pendingPasswordUser = user;
        resolve({ challenge: "NEW_PASSWORD_REQUIRED", email });
      }
    });
  });
}

export async function completeNewPassword(newPassword: string, email: string): Promise<SessionState> {
  if (!pendingPasswordUser) {
    throw new Error("Password challenge expired. Sign in with the temporary password again.");
  }
  return new Promise<SessionState>((resolve, reject) => {
    pendingPasswordUser?.completeNewPasswordChallenge(newPassword, {}, {
      onSuccess: (session) => {
        pendingPasswordUser = undefined;
        resolve(persistSession(session, email));
      },
      onFailure: reject
    });
  });
}

function persistSession(session: CognitoUserSession, fallbackEmail: string): SessionState {
  const idToken = session.getIdToken().getJwtToken();
  const payload = session.getIdToken().decodePayload() as { email?: string; "cognito:groups"?: string[] };
  const state = {
    idToken,
    email: payload.email ?? fallbackEmail,
    groups: payload["cognito:groups"] ?? []
  };
  window.sessionStorage.setItem(tokenKey, state.idToken);
  window.sessionStorage.setItem(emailKey, state.email);
  window.localStorage.removeItem(tokenKey);
  window.localStorage.removeItem(emailKey);
  window.localStorage.removeItem("pickem.groups");
  return state;
}

export function isTokenExpired(token: string, nowSeconds = Math.floor(Date.now() / 1000)): boolean {
  const payload = decodeTokenPayload(token);
  return typeof payload?.exp !== "number" || payload.exp <= nowSeconds;
}

export function decodeTokenPayload(token: string): TokenPayload | undefined {
  try {
    return JSON.parse(base64UrlDecode(token.split(".")[1] ?? "")) as TokenPayload;
  } catch {
    return undefined;
  }
}

function groupsFromToken(token: string): string[] {
  return decodeTokenPayload(token)?.["cognito:groups"] ?? [];
}

function base64UrlDecode(value: string): string {
  const normalized = value.replace(/-/g, "+").replace(/_/g, "/");
  const padded = normalized.padEnd(normalized.length + ((4 - normalized.length % 4) % 4), "=");
  if (typeof window !== "undefined") {
    return window.atob(padded);
  }
  return Buffer.from(padded, "base64").toString("utf8");
}

function getUserPool(): CognitoUserPool {
  if (!appConfig.userPoolId || !appConfig.userPoolClientId) {
    throw new Error("Cognito environment variables are not configured.");
  }
  return new CognitoUserPool({
    UserPoolId: appConfig.userPoolId,
    ClientId: appConfig.userPoolClientId
  });
}
