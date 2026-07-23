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
const groupsKey = "pickem.groups";

export interface SessionState {
  idToken: string;
  email: string;
  groups: string[];
}

export function getStoredSession(): SessionState | undefined {
  if (typeof window === "undefined") {
    return undefined;
  }
  const idToken = window.localStorage.getItem(tokenKey);
  const email = window.localStorage.getItem(emailKey);
  const groups = window.localStorage.getItem(groupsKey);
  if (!idToken || !email) {
    return undefined;
  }
  return {
    idToken,
    email,
    groups: groups ? JSON.parse(groups) as string[] : []
  };
}

export function logout(): void {
  window.localStorage.removeItem(tokenKey);
  window.localStorage.removeItem(emailKey);
  window.localStorage.removeItem(groupsKey);
}

export async function login(email: string, password: string): Promise<SessionState> {
  const userPool = getUserPool();
  const user = new CognitoUser({ Username: email, Pool: userPool });
  const details = new AuthenticationDetails({ Username: email, Password: password });

  const session = await new Promise<CognitoUserSession>((resolve, reject) => {
    user.authenticateUser(details, {
      onSuccess: resolve,
      onFailure: reject,
      newPasswordRequired: () => reject(new Error("Set the temporary password in Cognito before logging in."))
    });
  });

  const idToken = session.getIdToken().getJwtToken();
  const payload = session.getIdToken().decodePayload() as { email?: string; "cognito:groups"?: string[] };
  const state = {
    idToken,
    email: payload.email ?? email,
    groups: payload["cognito:groups"] ?? []
  };
  window.localStorage.setItem(tokenKey, state.idToken);
  window.localStorage.setItem(emailKey, state.email);
  window.localStorage.setItem(groupsKey, JSON.stringify(state.groups));
  return state;
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
