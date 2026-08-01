import { describe, expect, it } from "vitest";
import { friendlyPasswordError, friendlyPasswordResetError, friendlyPasswordResetRequestError, isValidPassword, passwordsMatch, passwordPolicyErrors } from "../src/lib/passwordPolicy";

describe("password policy", () => {
  it("rejects passwords shorter than 12 characters", () => {
    expect(passwordPolicyErrors("Aa1!short")).toContain("At least 12 characters");
    expect(isValidPassword("Aa1!short")).toBe(false);
  });

  it("rejects passwords missing required character classes", () => {
    expect(passwordPolicyErrors("lowercase123!")).toContain("One uppercase letter");
    expect(passwordPolicyErrors("UPPERCASE123!")).toContain("One lowercase letter");
    expect(passwordPolicyErrors("NoNumbersHere!")).toContain("One number");
    expect(passwordPolicyErrors("NoSymbols1234")).toContain("One symbol");
  });

  it("accepts a password that satisfies the deployed Cognito policy", () => {
    expect(isValidPassword("ValidPass123!")).toBe(true);
  });

  it("maps Cognito password policy errors to a friendly message", () => {
    expect(friendlyPasswordError(new Error("Password does not conform to policy"))).toBe("Password does not meet the requirements below.");
  });

  it("requires reset password confirmation to match", () => {
    expect(passwordsMatch("ValidPass123!", "ValidPass123!")).toBe(true);
    expect(passwordsMatch("ValidPass123!", "Different123!")).toBe(false);
    expect(passwordsMatch("", "")).toBe(false);
  });

  it("maps reset-code and reset-request errors without disclosing account state", () => {
    expect(friendlyPasswordResetError(Object.assign(new Error(), { name: "CodeMismatchException" }))).toBe("That verification code is incorrect.");
    expect(friendlyPasswordResetError(Object.assign(new Error(), { name: "ExpiredCodeException" }))).toMatch(/expired/i);
    expect(friendlyPasswordResetError(new Error("Password does not conform to policy"))).toBe("Password does not meet the requirements below.");
    expect(friendlyPasswordResetRequestError(Object.assign(new Error(), { name: "LimitExceededException" }))).toMatch(/too many/i);
    expect(friendlyPasswordResetRequestError(Object.assign(new Error(), { name: "UserNotFoundException" }))).not.toMatch(/user|account/i);
  });
});
