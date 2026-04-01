import { describe, it, expect } from "vitest";
import {
  formatPhone,
  formatDate,
  formatTime,
  formatCurrency,
  formatDateTime,
  formatRelativeTime,
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
    expect(result).toBe("15 mars 2024");
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
    expect(formatCurrency(1500000)).toBe("1\u00a0500 tkr");
  });

  it("rounds to nearest thousand", () => {
    expect(formatCurrency(1499)).toBe("1 tkr");
  });

  it("handles zero", () => {
    expect(formatCurrency(0)).toBe("0 tkr");
  });
});

describe("formatDateTime", () => {
  it("formats ISO datetime to Swedish locale", () => {
    const result = formatDateTime("2024-03-15T14:30:00Z");
    expect(result).toContain("mars");
    expect(result).toContain("2024");
  });

  it("returns original string for invalid datetime", () => {
    expect(formatDateTime("not-valid")).toBe("not-valid");
  });
});

describe("formatRelativeTime", () => {
  it("returns 'Just nu' for timestamps within the last minute", () => {
    const now = new Date().toISOString();
    expect(formatRelativeTime(now)).toBe("Just nu");
  });

  it("returns minutes for recent timestamps", () => {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000).toISOString();
    expect(formatRelativeTime(fiveMinAgo)).toBe("5 min sedan");
  });

  it("returns hours for timestamps within the day", () => {
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(twoHoursAgo)).toBe("2 tim sedan");
  });

  it("returns '1 dag sedan' for yesterday", () => {
    const oneDayAgo = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(oneDayAgo)).toBe("1 dag sedan");
  });

  it("returns days for older timestamps", () => {
    const threeDaysAgo = new Date(Date.now() - 3 * 24 * 60 * 60 * 1000).toISOString();
    expect(formatRelativeTime(threeDaysAgo)).toBe("3 dagar sedan");
  });

  it("returns original string for invalid datetime", () => {
    expect(formatRelativeTime("not-valid")).toBe("not-valid");
  });
});
