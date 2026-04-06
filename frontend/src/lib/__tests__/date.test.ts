import { describe, it, expect, vi, afterEach } from "vitest";
import { todayISO, daysAgoISO, yesterdayISO, filterByDateRange } from "../date";
import type { DateRange } from "../date";

describe("todayISO", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns current date in YYYY-MM-DD format", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T14:30:00Z"));
    expect(todayISO()).toBe("2026-04-05");
  });

  it("returns a 10-character string", () => {
    expect(todayISO()).toHaveLength(10);
  });
});

describe("daysAgoISO", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns 0 days ago as today", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T10:00:00Z"));
    expect(daysAgoISO(0)).toBe("2026-04-05");
  });

  it("returns 1 day ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T10:00:00Z"));
    expect(daysAgoISO(1)).toBe("2026-04-04");
  });

  it("returns 7 days ago", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T10:00:00Z"));
    expect(daysAgoISO(7)).toBe("2026-03-29");
  });

  it("handles month boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-03-01T10:00:00Z"));
    expect(daysAgoISO(1)).toBe("2026-02-28");
  });

  it("handles year boundary", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T10:00:00Z"));
    expect(daysAgoISO(1)).toBe("2025-12-31");
  });
});

describe("yesterdayISO", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("returns yesterday's date", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-04-05T10:00:00Z"));
    expect(yesterdayISO()).toBe("2026-04-04");
  });
});

describe("filterByDateRange", () => {
  const items = [
    { id: 1, date: "2026-04-01T10:00:00Z" },
    { id: 2, date: "2026-04-03T12:00:00Z" },
    { id: 3, date: "2026-04-05T08:00:00Z" },
    { id: 4, date: "2026-04-07T15:00:00Z" },
    { id: 5, date: "2026-04-10T09:00:00Z" },
  ];

  it("filters items within a date range", () => {
    const range: DateRange = { from: "2026-04-03", to: "2026-04-07" };
    const result = filterByDateRange(items, "date", range);
    expect(result.map((r) => r.id)).toEqual([2, 3, 4]);
  });

  it("includes items on boundary dates", () => {
    const range: DateRange = { from: "2026-04-01", to: "2026-04-01" };
    const result = filterByDateRange(items, "date", range);
    expect(result.map((r) => r.id)).toEqual([1]);
  });

  it("returns empty array when no items match", () => {
    const range: DateRange = { from: "2026-04-20", to: "2026-04-25" };
    const result = filterByDateRange(items, "date", range);
    expect(result).toEqual([]);
  });

  it("returns all items when range covers everything", () => {
    const range: DateRange = { from: "2026-01-01", to: "2026-12-31" };
    const result = filterByDateRange(items, "date", range);
    expect(result.length).toBe(5);
  });

  it("handles single-day range", () => {
    const range: DateRange = { from: "2026-04-05", to: "2026-04-05" };
    const result = filterByDateRange(items, "date", range);
    expect(result.map((r) => r.id)).toEqual([3]);
  });
});
