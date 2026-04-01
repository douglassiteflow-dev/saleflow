import { describe, it, expect } from "vitest";
import {
  formatPhone,
  formatDate,
  formatTime,
  formatCurrency,
  formatDateTime,
} from "../format";

describe("formatPhone", () => {
  it("formats +46 mobile numbers to Swedish style", () => {
    expect(formatPhone("+46701234567")).toBe("070-123 45 67");
  });

  it("handles +46 with spaces", () => {
    expect(formatPhone("+46 70 123 45 67")).toBe("070-123 45 67");
  });

  it("returns original if not +46", () => {
    expect(formatPhone("0701234567")).toBe("0701234567");
  });

  it("returns original for non-matching format", () => {
    expect(formatPhone("+1234567")).toBe("+1234567");
  });

  it("handles +46 number that is not 10 local digits", () => {
    // +46 + 8 digits = 9 local digits (not 10)
    expect(formatPhone("+4612345678")).toBe("012345678");
  });
});

describe("formatDate", () => {
  it("formats ISO date to Swedish locale", () => {
    const result = formatDate("2024-03-15");
    expect(result).toContain("2024");
    // Month name varies by locale, just check it contains some text
    expect(result.length).toBeGreaterThan(4);
  });

  it("returns original string for invalid date", () => {
    expect(formatDate("not-a-date")).toBe("not-a-date");
  });
});

describe("formatTime", () => {
  it("formats HH:MM:SS to HH:MM", () => {
    expect(formatTime("14:30:00")).toBe("14:30");
  });

  it("keeps HH:MM as-is", () => {
    expect(formatTime("14:30")).toBe("14:30");
  });

  it("returns empty string for empty input", () => {
    expect(formatTime("")).toBe("");
  });

  it("returns single-segment time as-is", () => {
    expect(formatTime("14")).toBe("14");
  });
});

describe("formatCurrency", () => {
  it("formats number as tkr", () => {
    const result = formatCurrency(1500000);
    expect(result).toContain("tkr");
    // 1500000 / 1000 = 1500
    expect(result).toContain("1");
    expect(result).toContain("500");
  });

  it("rounds to nearest thousand", () => {
    const result = formatCurrency(1499);
    expect(result).toContain("1");
    expect(result).toContain("tkr");
  });

  it("handles zero", () => {
    expect(formatCurrency(0)).toContain("0");
    expect(formatCurrency(0)).toContain("tkr");
  });
});

describe("formatDateTime", () => {
  it("formats ISO datetime to Swedish locale", () => {
    const result = formatDateTime("2024-03-15T14:30:00Z");
    expect(result).toContain("2024");
    expect(result.length).toBeGreaterThan(4);
  });

  it("returns original string for invalid datetime", () => {
    expect(formatDateTime("not-valid")).toBe("not-valid");
  });
});
