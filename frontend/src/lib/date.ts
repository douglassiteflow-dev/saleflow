export function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

export function daysAgoISO(days: number): string {
  const d = new Date();
  d.setDate(d.getDate() - days);
  return d.toISOString().slice(0, 10);
}

export function yesterdayISO(): string {
  return daysAgoISO(1);
}

export interface DateRange {
  from: string;
  to: string;
}

export function filterByDateRange<T>(
  items: T[],
  dateField: keyof T,
  range: DateRange,
): T[] {
  return items.filter((item) => {
    const d = String(item[dateField]).slice(0, 10);
    return d >= range.from && d <= range.to;
  });
}
