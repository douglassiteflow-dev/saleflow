import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { api } from "@/api/client";
import { cn } from "@/lib/cn";
import { ReportModal } from "@/components/report-modal";
import type { DashboardData } from "@/api/types";
import type { Meeting } from "@/api/types";

// Map of routes → prefetch thunks. Called once on first hover.
function usePrefetchForRoute(to: string) {
  const qc = useQueryClient();

  return function prefetch() {
    if (to === "/dashboard") {
      void qc.prefetchQuery({
        queryKey: ["dashboard"],
        queryFn: () => api<DashboardData>("/api/dashboard"),
        staleTime: 60_000,
      });
    } else if (to === "/meetings") {
      void qc.prefetchQuery({
        queryKey: ["meetings"],
        queryFn: () =>
          api<{ meetings: Meeting[] }>("/api/meetings").then((r) => r.meetings),
        staleTime: 60_000,
      });
    }
    // dialer, history, profile — no cheap prefetch target
  };
}

interface NavItemProps {
  to: string;
  label: string;
  disabled?: boolean;
}

export function NavItem({ to, label, disabled }: NavItemProps) {
  const prefetch = usePrefetchForRoute(to);

  if (disabled) {
    return (
      <span
        title="Kommer snart"
        className="flex items-center px-3 py-2 rounded-md text-sm text-[var(--color-text-secondary)] opacity-50 cursor-not-allowed select-none"
      >
        {label}
      </span>
    );
  }

  return (
    <NavLink
      to={to}
      onMouseEnter={prefetch}
      className={({ isActive }) =>
        cn(
          "flex items-center px-3 py-2 rounded-md text-sm font-medium transition-colors duration-150",
          isActive
            ? "bg-indigo-50 text-indigo-700"
            : "text-[var(--color-text-secondary)] hover:bg-[var(--color-bg-panel)] hover:text-[var(--color-text-primary)]",
        )
      }
    >
      {label}
    </NavLink>
  );
}

export function Sidebar() {
  const [showReport, setShowReport] = useState(false);

  return (
    <>
      <aside
        style={{ width: "240px" }}
        className="fixed top-0 left-0 h-screen bg-white border-r border-[var(--color-border)] flex flex-col z-20"
      >
        {/* Logo */}
        <div className="flex items-center h-14 px-4 border-b border-[var(--color-border)]">
          <span className="text-lg font-semibold text-indigo-600">Saleflow</span>
        </div>

        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
            Översikt
          </p>
          <NavItem to="/dashboard" label="Dashboard" />
          <NavItem to="/meetings" label="Möten" />
          <NavItem to="/history" label="Samtalshistorik" />
          <NavItem to="/daily-summary" label="Dagssammanfattning" />

          <p className="px-3 mt-5 mb-2 text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
            Försäljning
          </p>
          <NavItem to="/pipeline" label="Pipeline" />
          <NavItem to="/customers" label="Kunder" />

          <p className="px-3 mt-5 mb-2 text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
            Hantera
          </p>
          <NavItem to="/admin/users" label="Användare" />
          <NavItem to="/admin/import" label="Importera" />
          <NavItem to="/admin/lists" label="Listor" />
          <NavItem to="/admin/stats" label="Statistik" />
          <NavItem to="/admin/requests" label="Förfrågningar" />
          <NavItem to="/admin/logs" label="Loggar" />
          <NavItem to="/admin/apps" label="Appar" />
          <NavItem to="/admin/playbook" label="Säljmanus" />
        </nav>

        {/* Report button at bottom */}
        <div className="px-3 pb-4 border-t border-[var(--color-border)] pt-3">
          <button
            onClick={() => setShowReport(true)}
            className="flex w-full items-center gap-2 px-3 py-2 rounded-[6px] text-sm font-medium text-rose-600 hover:bg-rose-50 transition-colors duration-150"
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 20 20"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              className="shrink-0"
            >
              <circle cx="10" cy="10" r="8" />
              <path d="M10 6v4M10 14h.01" strokeLinecap="round" />
            </svg>
            Rapportera
          </button>
        </div>
      </aside>

      {showReport && <ReportModal onClose={() => setShowReport(false)} />}
    </>
  );
}
