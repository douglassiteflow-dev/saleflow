import { cn } from "@/lib/cn";
import { todayISO, daysAgoISO, type DateRange } from "@/lib/date";

export type { DateRange };

interface TabToolbarProps {
  title: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange) => void;
  activePreset?: string | null;
  onPresetChange?: (label: string) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalCount: number;
}

const PRESETS = [
  { label: "Idag", get: () => ({ from: todayISO(), to: todayISO() }) },
  { label: "Igår", get: () => { const s = daysAgoISO(1); return { from: s, to: s }; } },
  { label: "Senaste 7 dagarna", get: () => ({ from: daysAgoISO(6), to: todayISO() }) },
  { label: "Senaste 30 dagarna", get: () => ({ from: daysAgoISO(29), to: todayISO() }) },
];

export function TabToolbar({
  title,
  search,
  onSearchChange,
  searchPlaceholder = "Sök...",
  dateRange,
  onDateRangeChange,
  activePreset,
  onPresetChange,
  page,
  totalPages,
  onPageChange,
  totalCount,
}: TabToolbarProps) {
  return (
    <div className="flex items-center gap-2 px-5 py-2.5 bg-[var(--color-bg-panel)] border-b border-[var(--color-border)]">
      <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] shrink-0">
        {title}
      </p>

      {/* Preset buttons */}
      {onDateRangeChange && (
        <div className="flex gap-1 ml-2">
          {PRESETS.map((p) => {
            const isActive = activePreset === p.label;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => {
                  onDateRangeChange(p.get());
                  onPresetChange?.(p.label);
                  onPageChange(1);
                }}
                className={cn(
                  "px-2 py-0.5 rounded text-[10px] font-medium transition-colors cursor-pointer",
                  isActive
                    ? "bg-[var(--color-accent)] text-white"
                    : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-primary)]",
                )}
              >
                {p.label}
              </button>
            );
          })}
        </div>
      )}

      <div className="flex-1" />

      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className="h-7 w-36 rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
      />

      {/* Date range pickers */}
      {onDateRangeChange && dateRange && (
        <div className="flex items-center gap-1">
          <input
            type="date"
            value={dateRange.from}
            onChange={(e) => { onDateRangeChange({ ...dateRange, from: e.target.value }); onPresetChange?.(""); }}
            className="h-7 rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-1.5 text-[10px] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
          />
          <span className="text-[10px] text-[var(--color-text-secondary)]">–</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => { onDateRangeChange({ ...dateRange, to: e.target.value }); onPresetChange?.(""); }}
            className="h-7 rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-1.5 text-[10px] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
          />
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[10px] text-[var(--color-text-secondary)]">
            {totalCount} st
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page - 1)}
            disabled={page <= 1}
            className={cn(
              "h-7 w-7 rounded-md border border-[var(--color-border)] text-xs flex items-center justify-center",
              page <= 1 ? "opacity-30 cursor-not-allowed" : "cursor-pointer hover:bg-[var(--color-bg-primary)]",
            )}
          >
            ‹
          </button>
          <span className="text-[10px] text-[var(--color-text-secondary)] tabular-nums">
            {page}/{totalPages}
          </span>
          <button
            type="button"
            onClick={() => onPageChange(page + 1)}
            disabled={page >= totalPages}
            className={cn(
              "h-7 w-7 rounded-md border border-[var(--color-border)] text-xs flex items-center justify-center",
              page >= totalPages ? "opacity-30 cursor-not-allowed" : "cursor-pointer hover:bg-[var(--color-bg-primary)]",
            )}
          >
            ›
          </button>
        </div>
      )}
    </div>
  );
}

const PAGE_SIZE = 20;

export function usePagination<T>(items: T[], search: string, searchFn: (item: T, query: string) => boolean) {
  const filtered = search.trim()
    ? items.filter((item) => searchFn(item, search.toLowerCase()))
    : items;

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE));

  return {
    filtered,
    totalPages,
    totalCount: filtered.length,
    paginate: (page: number) => filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
  };
}
