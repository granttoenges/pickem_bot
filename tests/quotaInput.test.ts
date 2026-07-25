import { describe, expect, it } from "vitest";
import { isValidQuotaInput, parseQuotaInput } from "../src/lib/quotaInput";

describe("quota input parsing", () => {
  it("allows a blank editing state but does not parse it as zero", () => {
    expect(parseQuotaInput("")).toBeUndefined();
    expect(isValidQuotaInput("")).toBe(false);
  });

  it("parses valid quota values", () => {
    expect(parseQuotaInput("0")).toBe(0);
    expect(parseQuotaInput("3")).toBe(3);
    expect(parseQuotaInput("20")).toBe(20);
  });

  it("rejects invalid quota values", () => {
    expect(parseQuotaInput("-1")).toBeUndefined();
    expect(parseQuotaInput("21")).toBeUndefined();
    expect(parseQuotaInput("1.5")).toBeUndefined();
  });
});
