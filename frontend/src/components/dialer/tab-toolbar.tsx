import { cn } from "@/lib/cn";

export interface DateRange {
  from: string;
  to: string;
}

interface TabToolbarProps {
  title: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  dateRange?: DateRange;
  onDateRangeChange?: (range: DateRange) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalCount: number;
}

function todayISO() {
  return new Date().toISOString().slice(0, 10);
}

const PRESETS = [
  { label: "Idag", get: () => ({ from: todayISO(), to: todayISO() }) },
  { label: "Igår", get: () => { const d = new Date(); d.setDate(d.getDate() - 1); const s = d.toISOString().slice(0, 10); return { from: s, to: s }; } },
  { label: "Veckan", get: () => { const now = new Date(); const day = now.getDay() || 7; const mon = new Date(now); mon.setDate(now.getDate() - day + 1); return { from: mon.toISOString().slice(0, 10), to: todayISO() }; } },
  { label: "Månaden", get: () => { const now = new Date(); return { from: `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`, to: todayISO() }; } },
];

export function TabToolbar({
  title,
  search,
  onSearchChange,
  searchPlaceholder = "Sök...",
  dateRange,
  onDateRangeChange,
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
            const preset = p.get();
            const isActive = dateRange?.from === preset.from && dateRange?.to === preset.to;
            return (
              <button
                key={p.label}
                type="button"
                onClick={() => { onDateRangeChange(preset); onPageChange(1); }}
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
            onChange={(e) => onDateRangeChange({ ...dateRange, from: e.target.value })}
            className="h-7 rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-1.5 text-[10px] text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
          />
          <span className="text-[10px] text-[var(--color-text-secondary)]">–</span>
          <input
            type="date"
            value={dateRange.to}
            onChange={(e) => onDateRangeChange({ ...dateRange, to: e.target.value })}
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
