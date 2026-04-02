import { NavLink } from "react-router-dom";
import { useMe } from "@/api/auth";
import { cn } from "@/lib/cn";

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

  return (
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
          </>
        )}
      </nav>
    </aside>
  );
}
