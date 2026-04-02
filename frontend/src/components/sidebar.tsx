import { useState } from "react";
import { NavLink } from "react-router-dom";
import { useMe } from "@/api/auth";
import { cn } from "@/lib/cn";
import { ReportModal } from "@/components/report-modal";

interface NavItemProps {
  to: string;
  label: string;
  disabled?: boolean;
}

export function NavItem({ to, label, disabled }: NavItemProps) {
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
  const { data: user } = useMe();
  const isAdmin = user?.role === "admin";
  const [showReport, setShowReport] = useState(false);

  return (
    <>
      <aside
        style={{ width: "240px" }}
        className="fixed top-0 left-0 h-screen bg-white border-r border-[var(--color-border)] flex flex-col z-20"
      >
        {/* Logo */}
        <div className="flex items-center h-14 px-4 border-b border-[var(--color-border)]">
          <span className="text-lg font-semibold text-indigo-600">SaleFlow</span>
        </div>

        {/* Agent nav */}
        <nav className="flex-1 px-3 py-4 space-y-1 overflow-y-auto">
          <p className="px-3 mb-2 text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
            Agent
          </p>
          <NavItem to="/dashboard" label="Dashboard" />
          <NavItem to="/dialer" label="Ringare" />
          <NavItem to="/meetings" label="Möten" />
          <NavItem to="/history" label="Historik" />
          <NavItem to="/profile" label="Profil" />

          {isAdmin && (
            <>
              <p className="px-3 mt-5 mb-2 text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
                Admin
              </p>
              <NavItem to="/admin/users" label="Användare" />
              <NavItem to="/admin/import" label="Importera" />
              <NavItem to="/admin/lists" label="Listor" />
              <NavItem to="/admin/stats" label="Statistik" />
              <NavItem to="/admin/requests" label="Förfrågningar" />
            </>
          )}
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
