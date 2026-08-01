import { beforeEach, describe, expect, it, vi } from "vitest";

interface ForgotCallbacks {
  onSuccess: (data?: unknown) => void;
  onFailure: (error: Error) => void;
  inputVerificationCode?: (data?: unknown) => void;
}

interface ConfirmCallbacks {
  onSuccess: (data?: unknown) => void;
  onFailure: (error: Error) => void;
}

const mocks = vi.hoisted(() => ({
  forgotPassword: vi.fn(),
  confirmPassword: vi.fn(),
  cognitoUser: vi.fn()
}));

vi.mock("amazon-cognito-identity-js", () => ({
  AuthenticationDetails: class AuthenticationDetails {},
  CognitoUser: class CognitoUser {
    constructor(data: unknown) {
      mocks.cognitoUser(data);
      return {
        forgotPassword: mocks.forgotPassword,
        confirmPassword: mocks.confirmPassword
      };
    }
  },
  CognitoUserPool: class CognitoUserPool {},
  CognitoUserSession: class CognitoUserSession {}
}));

vi.mock("../src/lib/config", () => ({
  appConfig: {
    userPoolId: "us-east-1_example",
    userPoolClientId: "client-id"
  }
}));

import { confirmPasswordReset, requestPasswordReset } from "../src/lib/auth";

function namedError(name: string): Error {
  return Object.assign(new Error(name), { name });
}

describe("Cognito password reset helpers", () => {
  beforeEach(() => {
    mocks.forgotPassword.mockReset();
    mocks.confirmPassword.mockReset();
    mocks.cognitoUser.mockReset();
  });

  it("resolves when Cognito delivers a reset code", async () => {
    mocks.forgotPassword.mockImplementation((callbacks: ForgotCallbacks) => callbacks.inputVerificationCode?.({}));

    await expect(requestPasswordReset(" user@example.com ")).resolves.toBeUndefined();
    expect(mocks.cognitoUser).toHaveBeenCalledWith(expect.objectContaining({ Username: "user@example.com" }));
  });

  it("does not disclose nonexistent or ineligible accounts", async () => {
    mocks.forgotPassword.mockImplementation((callbacks: ForgotCallbacks) => callbacks.onFailure(namedError("UserNotFoundException")));
    await expect(requestPasswordReset("missing@example.com")).resolves.toBeUndefined();

    mocks.forgotPassword.mockImplementation((callbacks: ForgotCallbacks) => callbacks.onFailure(namedError("InvalidParameterException")));
    await expect(requestPasswordReset("unverified@example.com")).resolves.toBeUndefined();
  });

  it("surfaces rate limits from reset-code requests", async () => {
    const error = namedError("LimitExceededException");
    mocks.forgotPassword.mockImplementation((callbacks: ForgotCallbacks) => callbacks.onFailure(error));
    await expect(requestPasswordReset("user@example.com")).rejects.toBe(error);
  });

  it("confirms a reset with trimmed email and code", async () => {
    mocks.confirmPassword.mockImplementation((_code: string, _password: string, callbacks: ConfirmCallbacks) => callbacks.onSuccess());

    await expect(confirmPasswordReset(" user@example.com ", " 123456 ", "ValidPass123!")).resolves.toBeUndefined();
    expect(mocks.cognitoUser).toHaveBeenCalledWith(expect.objectContaining({ Username: "user@example.com" }));
    expect(mocks.confirmPassword).toHaveBeenCalledWith("123456", "ValidPass123!", expect.any(Object));
  });

  it.each(["CodeMismatchException", "ExpiredCodeException"])("surfaces %s confirmation failures", async (name) => {
    const error = namedError(name);
    mocks.confirmPassword.mockImplementation((_code: string, _password: string, callbacks: ConfirmCallbacks) => callbacks.onFailure(error));
    await expect(confirmPasswordReset("user@example.com", "123456", "ValidPass123!")).rejects.toBe(error);
  });
});
