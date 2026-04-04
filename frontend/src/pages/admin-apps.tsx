import { useNavigate } from "react-router-dom";
import { useAdminApps } from "@/api/apps";
import Loader from "@/components/kokonutui/loader";

export function AdminAppsPage() {
  const navigate = useNavigate();
  const { data: apps, isLoading } = useAdminApps();

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
          Appar
        </h1>
      </div>

      {isLoading ? (
        <Loader size="sm" title="Laddar appar..." />
      ) : !apps || apps.length === 0 ? (
        <p className="text-sm text-[var(--color-text-secondary)]">
          Inga appar hittades.
        </p>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-[var(--spacing-element)]">
          {apps.map((app) => (
            <button
              key={app.id}
              type="button"
              onClick={() => void navigate(`/admin/apps/${app.slug}`)}
              className="rounded-[14px] bg-[var(--color-bg-primary)] shadow text-left p-5 space-y-3 transition-shadow hover:shadow-md"
            >
              {/* Icon + name */}
              <div className="flex items-center gap-3">
                {app.icon && /\.(png|jpe?g|svg)$/i.test(app.icon) ? (
                  <img src={`/app-icons/${app.icon}`} alt={app.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
                ) : (
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white font-medium text-sm">
                    {app.name.charAt(0).toUpperCase()}
                  </span>
                )}
                <span className="font-medium text-[var(--color-text-primary)]">
                  {app.name}
                </span>
              </div>

              {/* Description */}
              <p className="text-sm text-[var(--color-text-secondary)] line-clamp-2">
                {app.description ?? "Ingen beskrivning"}
              </p>

              {/* Status + agent count */}
              <div className="flex items-center justify-between">
                <span
                  className={
                    app.active
                      ? "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-slate-50 text-slate-500 border-slate-200"
                  }
                >
                  {app.active ? "Aktiverad" : "Ej aktiverad"}
                </span>
                <span className="text-xs text-[var(--color-text-secondary)]">
                  {app.agent_count ?? 0} agenter
                </span>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
