import { describe, expect, it } from "vitest";
import { defaultRouteForSession, destinationAfterLogin, isSafeInternalPath, isTokenExpired } from "../src/lib/auth";

function token(payload: Record<string, unknown>): string {
  return [
    encode({ alg: "none", typ: "JWT" }),
    encode(payload),
    ""
  ].join(".");
}

function encode(value: Record<string, unknown>): string {
  return Buffer.from(JSON.stringify(value), "utf8").toString("base64url");
}

describe("auth helpers", () => {
  it("rejects expired or malformed tokens", () => {
    expect(isTokenExpired(token({ exp: 10 }), 11)).toBe(true);
    expect(isTokenExpired("not-a-token", 11)).toBe(true);
  });

  it("accepts unexpired tokens", () => {
    expect(isTokenExpired(token({ exp: 12 }), 11)).toBe(false);
  });

  it("allows only safe internal next paths", () => {
    expect(isSafeInternalPath("/admin")).toBe(true);
    expect(isSafeInternalPath("/standings?leagueId=friends")).toBe(true);
    expect(isSafeInternalPath("//evil.example")).toBe(false);
    expect(isSafeInternalPath("https://evil.example")).toBe(false);
  });

  it("chooses safe login destinations", () => {
    const player = { idToken: "token", email: "player@example.com", groups: ["player"] };
    const admin = { idToken: "token", email: "admin@example.com", groups: ["super_admin"] };

    expect(defaultRouteForSession(player)).toBe("/");
    expect(defaultRouteForSession(admin)).toBe("/admin");
    expect(destinationAfterLogin(admin, "/standings")).toBe("/standings");
    expect(destinationAfterLogin(admin, "https://evil.example")).toBe("/admin");
  });
});
