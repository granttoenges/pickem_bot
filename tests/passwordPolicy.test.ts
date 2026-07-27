import { describe, expect, it } from "vitest";
import { friendlyPasswordError, isValidPassword, passwordPolicyErrors } from "../src/lib/passwordPolicy";

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
});
