import { describe, it, expect } from "vitest";
import { normalizePhone, phoneMatches } from "../phone";

describe("normalizePhone", () => {
  it("strips leading 0", () => {
    expect(normalizePhone("070123456")).toBe("70123456");
  });

  it("strips +46 prefix", () => {
    expect(normalizePhone("+4670123456")).toBe("70123456");
  });

  it("strips 0046 prefix", () => {
    expect(normalizePhone("0046701234567")).toBe("701234567");
  });

  it("returns digits unchanged when no prefix matches", () => {
    expect(normalizePhone("701234567")).toBe("701234567");
  });

  it("strips spaces and dashes", () => {
    expect(normalizePhone("070-123 456")).toBe("70123456");
  });
});

describe("phoneMatches", () => {
  it("matches +46 number against 0-prefixed query", () => {
    expect(phoneMatches("+46701234567", "070")).toBe(true);
  });

  it("matches 0-prefixed number against +46 query (full-length)", () => {
    expect(phoneMatches("0701234567", "+46701234567")).toBe(true);
  });

  it("does not strip +46 from short queries (fewer than 9 digits)", () => {
    // normalizePhone only strips 46-prefix when digits.length > 8
    expect(phoneMatches("0701234567", "+4670")).toBe(false);
  });

  it("returns false when phone is null", () => {
    expect(phoneMatches(null, "070")).toBe(false);
  });

  it("returns false when query is empty", () => {
    expect(phoneMatches("0701234567", "")).toBe(false);
  });

  it("returns false when phone is undefined", () => {
    expect(phoneMatches(undefined, "070")).toBe(false);
  });

  it("returns false when numbers do not match", () => {
    expect(phoneMatches("0701234567", "0809")).toBe(false);
  });
});
