import { useState } from "react";
import { phoneMatches } from "@/lib/phone";
import { formatPhone, formatDateTime } from "@/lib/format";
import { TabToolbar, usePagination } from "@/components/dialer/tab-toolbar";
import type { Lead } from "@/api/types";

interface CallbacksTabProps {
  callbacks: Lead[];
  onCallbackClick: (lead: Lead) => void;
}

export function CallbacksTab({ callbacks, onCallbackClick }: CallbacksTabProps) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);

  const { totalPages, totalCount, paginate } = usePagination(callbacks, search, (cb, q) =>
    cb.företag.toLowerCase().includes(q) || phoneMatches(cb.telefon, q),
  );
  const visible = paginate(page);

  return (
    <div className="flex-1 flex flex-col overflow-hidden">
      <TabToolbar
        title="Callbacks"
        search={search}
        onSearchChange={(v) => { setSearch(v); setPage(1); }}
        searchPlaceholder="Sök företag..."
        page={page}
        totalPages={totalPages}
        onPageChange={setPage}
        totalCount={totalCount}
      />
      <div className="flex-1 overflow-auto">
        {visible.length === 0 ? (
          <p className="p-5 text-sm text-[var(--color-text-secondary)]">
            Inga återuppringningar.
          </p>
        ) : (
          <table className="w-full text-[13px]">
            <thead>
              <tr className="bg-[var(--color-bg-panel)]">
                {["Företag", "Telefon", "Återuppringning", ""].map((h) => (
                  <th key={h} className="px-5 py-2.5 text-left text-[10px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)]">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {visible.map((cb) => (
                <tr key={cb.id} className="border-t border-[var(--color-border)] cursor-pointer transition-colors hover:bg-[var(--color-bg-panel)]" onClick={() => onCallbackClick(cb)}>
                  <td className="px-5 py-2.5 font-medium text-[var(--color-text-primary)]">{cb.företag}</td>
                  <td className="px-5 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">{formatPhone(cb.telefon)}</td>
                  <td className="px-5 py-2.5 font-mono text-xs text-[var(--color-text-secondary)]">{cb.callback_at ? formatDateTime(cb.callback_at) : "—"}</td>
                  <td className="px-5 py-2.5 text-right">
                    <button type="button" className="rounded-md bg-[var(--color-accent)] px-3 py-1 text-[11px] font-medium text-white hover:brightness-110 transition-all" onClick={(e) => { e.stopPropagation(); onCallbackClick(cb); }}>Öppna</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
