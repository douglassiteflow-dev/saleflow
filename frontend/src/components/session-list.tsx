import { Monitor, Smartphone, Tablet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { formatRelativeTime } from "@/lib/format";
import type { LoginSession } from "@/api/types";

interface SessionListProps {
  sessions: LoginSession[];
  onLogout?: (sessionId: string) => void;
  showForceLogout?: boolean;
}

function DeviceIcon({ deviceType }: { deviceType: string }) {
  const className = "w-5 h-5 text-[var(--color-text-secondary)]";
  switch (deviceType) {
    case "smartphone":
      return <Smartphone className={className} aria-label="Mobil" />;
    case "tablet":
      return <Tablet className={className} aria-label="Surfplatta" />;
    default:
      return <Monitor className={className} aria-label="Dator" />;
  }
}

export function SessionList({ sessions, onLogout, showForceLogout }: SessionListProps) {
  if (sessions.length === 0) {
    return (
      <p className="text-sm text-[var(--color-text-secondary)]">
        Inga aktiva sessioner.
      </p>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="bg-slate-50 text-left">
            <th
              className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
              style={{ fontSize: "12px" }}
            >
              Enhet
            </th>
            <th
              className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
              style={{ fontSize: "12px" }}
            >
              Webbläsare
            </th>
            <th
              className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
              style={{ fontSize: "12px" }}
            >
              Plats
            </th>
            <th
              className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
              style={{ fontSize: "12px" }}
            >
              Senast aktiv
            </th>
            <th
              className="px-4 py-2.5 font-medium text-[var(--color-text-secondary)] uppercase tracking-wider"
              style={{ fontSize: "12px" }}
            >
              {/* Actions */}
            </th>
          </tr>
        </thead>
        <tbody>
          {sessions.map((session, i) => (
            <tr
              key={session.id}
              className={i !== sessions.length - 1 ? "border-b border-slate-200" : ""}
            >
              <td className="px-4 py-3">
                <DeviceIcon deviceType={session.device_type} />
              </td>
              <td className="px-4 py-3 text-[var(--color-text-primary)]">
                {session.browser}
              </td>
              <td className="px-4 py-3 text-[var(--color-text-secondary)]">
                {session.city && session.country
                  ? `${session.city}, ${session.country}`
                  : session.country ?? "Okänd plats"}
              </td>
              <td className="px-4 py-3 font-mono text-[var(--color-text-secondary)]" style={{ fontSize: "13px" }}>
                {formatRelativeTime(session.last_active_at)}
              </td>
              <td className="px-4 py-3 text-right">
                {session.current ? (
                  <span className="inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-medium bg-indigo-50 text-indigo-700 border-indigo-200">
                    Nuvarande
                  </span>
                ) : (onLogout && (showForceLogout || !session.force_logged_out)) ? (
                  <Button
                    variant="danger"
                    size="default"
                    onClick={() => onLogout(session.id)}
                  >
                    Logga ut
                  </Button>
                ) : session.force_logged_out ? (
                  <span className="text-xs text-[var(--color-text-secondary)]">Utloggad</span>
                ) : null}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
