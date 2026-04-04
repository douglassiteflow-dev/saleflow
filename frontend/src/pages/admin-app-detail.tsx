import { useParams, useNavigate } from "react-router-dom";
import {
  useAdminAppDetail,
  useToggleApp,
  useAddPermission,
  useRemovePermission,
} from "@/api/apps";
import { Button } from "@/components/ui/button";
import { Card, CardTitle } from "@/components/ui/card";
import Loader from "@/components/kokonutui/loader";

export function AdminAppDetailPage() {
  const { slug } = useParams<{ slug: string }>();
  const navigate = useNavigate();
  const { data, isLoading } = useAdminAppDetail(slug);
  const toggleApp = useToggleApp();
  const addPermission = useAddPermission();
  const removePermission = useRemovePermission();

  if (isLoading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[60vh]">
        <Loader size="sm" title="Laddar app..." />
      </div>
    );
  }

  const { app, agents } = data;

  function handleToggle() {
    if (!slug) return;
    toggleApp.mutate(slug);
  }

  function handlePermissionChange(userId: string, hasAccess: boolean) {
    if (!slug) return;
    if (hasAccess) {
      removePermission.mutate({ slug, userId });
    } else {
      addPermission.mutate({ slug, userId });
    }
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div>
        <button
          type="button"
          onClick={() => void navigate("/admin/apps")}
          className="mb-3 inline-flex items-center gap-1 text-sm text-[var(--color-text-secondary)] hover:text-[var(--color-accent)] transition-colors cursor-pointer"
        >
          &larr; Tillbaka till appar
        </button>
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            {app.icon && /\.(png|jpe?g|svg)$/i.test(app.icon) ? (
              <img src={`/app-icons/${app.icon}`} alt={app.name} className="h-10 w-10 shrink-0 rounded-lg object-cover" />
            ) : (
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-[var(--color-accent)] text-white font-medium text-sm">
                {app.name.charAt(0).toUpperCase()}
              </span>
            )}
            <h1 className="text-[22px] font-light tracking-[-0.5px] text-[var(--color-text-primary)]">
              {app.name}
            </h1>
          </div>
          <Button
            variant={app.active ? "secondary" : "primary"}
            onClick={handleToggle}
            disabled={toggleApp.isPending}
            className={
              app.active
                ? "bg-emerald-600 text-white border-emerald-600 hover:bg-emerald-700"
                : ""
            }
          >
            {toggleApp.isPending
              ? "Sparar..."
              : app.active
                ? "Aktiverad"
                : "Aktivera"}
          </Button>
        </div>
        {app.long_description && (
          <p className="mt-2 text-sm text-[var(--color-text-secondary)]">
            {app.long_description}
          </p>
        )}
      </div>

      {/* Agent permissions */}
      <Card>
        <CardTitle className="mb-4">Agenttillgång</CardTitle>

        {agents.length === 0 ? (
          <p className="text-sm text-[var(--color-text-secondary)]">
            Inga agenter hittades.
          </p>
        ) : (
          <div className="space-y-2">
            {agents.map((agent) => (
              <label
                key={agent.user_id}
                className="flex items-center gap-3 rounded-lg px-3 py-2.5 transition-colors hover:bg-[var(--color-bg-panel)] cursor-pointer"
              >
                <input
                  type="checkbox"
                  checked={agent.has_access}
                  onChange={() =>
                    handlePermissionChange(agent.user_id, agent.has_access)
                  }
                  className="h-4 w-4 rounded border-[var(--color-border-input)] text-[var(--color-accent)] focus:ring-[var(--color-accent)] cursor-pointer"
                />
                <span className="text-sm text-[var(--color-text-primary)]">
                  {agent.name}
                </span>
              </label>
            ))}
          </div>
        )}
      </Card>
    </div>
  );
}
