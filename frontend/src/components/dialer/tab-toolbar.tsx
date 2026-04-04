import { cn } from "@/lib/cn";

interface TabToolbarProps {
  title: string;
  search: string;
  onSearchChange: (value: string) => void;
  searchPlaceholder?: string;
  date?: string;
  onDateChange?: (value: string) => void;
  page: number;
  totalPages: number;
  onPageChange: (page: number) => void;
  totalCount: number;
}

export function TabToolbar({
  title,
  search,
  onSearchChange,
  searchPlaceholder = "Sök...",
  date,
  onDateChange,
  page,
  totalPages,
  onPageChange,
  totalCount,
}: TabToolbarProps) {
  return (
    <div className="flex items-center gap-3 px-5 py-2.5 bg-[var(--color-bg-panel)] border-b border-[var(--color-border)]">
      <p className="text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] shrink-0">
        {title}
      </p>

      <div className="flex-1" />

      <input
        type="text"
        value={search}
        onChange={(e) => onSearchChange(e.target.value)}
        placeholder={searchPlaceholder}
        className="h-7 w-40 rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2.5 text-xs text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
      />

      {onDateChange && (
        <input
          type="date"
          value={date}
          onChange={(e) => onDateChange(e.target.value)}
          className="h-7 rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2 text-xs text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]/20"
        />
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
