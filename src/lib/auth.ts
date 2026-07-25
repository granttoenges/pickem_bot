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

export interface SessionState {
  idToken: string;
  email: string;
  groups: string[];
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
  if (!token || !email) {
    return undefined;
  }
  return {
    idToken: token,
    email,
    groups: groupsFromToken(token)
  };
}

export function logout(): void {
  window.sessionStorage.removeItem(tokenKey);
  window.sessionStorage.removeItem(emailKey);
  window.localStorage.removeItem(tokenKey);
  window.localStorage.removeItem(emailKey);
  window.localStorage.removeItem("pickem.groups");
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

function groupsFromToken(token: string): string[] {
  try {
    const payload = JSON.parse(window.atob(token.split(".")[1] ?? "")) as { "cognito:groups"?: string[] };
    return payload["cognito:groups"] ?? [];
  } catch {
    return [];
  }
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
