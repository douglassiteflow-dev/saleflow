import { useNotifications, useMarkRead, useMarkAllRead, useUnreadCount } from "@/api/notifications";
import { formatRelativeTime } from "@/lib/format";
import type { AppNotification } from "@/api/types";

interface NotificationDropdownProps {
  open: boolean;
  onClose: () => void;
  onOpenMeeting: (meetingId: string) => void;
  onOpenLead: (leadId: string) => void;
  onUpdateMeetingStatus: (meetingId: string, status: "completed" | "cancelled") => void;
  onRebookMeeting: (meetingId: string) => void;
}

export function NotificationDropdown({
  open,
  onClose,
  onOpenMeeting,
  onOpenLead,
  onUpdateMeetingStatus,
  onRebookMeeting,
}: NotificationDropdownProps) {
  const { data: notifications } = useNotifications();
  const markRead = useMarkRead();
  const markAllRead = useMarkAllRead();
  const unreadCount = useUnreadCount();

  if (!open) return null;

  const sorted = [...(notifications ?? [])].sort(
    (a, b) => new Date(b.inserted_at).getTime() - new Date(a.inserted_at).getTime(),
  );

  function handleMarkAllRead() {
    markAllRead.mutate();
  }

  function handleNotificationClick(n: AppNotification) {
    if (!n.read_at) {
      markRead.mutate(n.id);
    }
  }

  function handleAction(n: AppNotification, action: () => void) {
    if (!n.read_at) {
      markRead.mutate(n.id);
    }
    action();
  }

  function renderActions(n: AppNotification) {
    const resourceId = n.resource_id;
    if (!resourceId) return null;

    switch (n.type) {
      case "meeting_soon":
        return (
          <button
            type="button"
            className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
            style={{
              background: "var(--color-accent)",
              color: "#fff",
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleAction(n, () => onOpenMeeting(resourceId));
            }}
          >
            Öppna
          </button>
        );

      case "meeting_update":
        return (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
              style={{
                background: "var(--color-success)",
                color: "#fff",
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleAction(n, () => onUpdateMeetingStatus(resourceId, "completed"));
              }}
            >
              Genomförd
            </button>
            <button
              type="button"
              className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
              style={{
                background: "var(--color-danger)",
                color: "#fff",
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleAction(n, () => onUpdateMeetingStatus(resourceId, "cancelled"));
              }}
            >
              No-show
            </button>
            <button
              type="button"
              className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors border"
              style={{
                borderColor: "var(--color-border)",
                color: "var(--color-text-primary)",
              }}
              onClick={(e) => {
                e.stopPropagation();
                handleAction(n, () => onRebookMeeting(resourceId));
              }}
            >
              Boka om
            </button>
          </div>
        );

      case "callback_due":
        return (
          <button
            type="button"
            className="px-2 py-0.5 rounded text-[11px] font-medium transition-colors"
            style={{
              background: "var(--color-accent)",
              color: "#fff",
            }}
            onClick={(e) => {
              e.stopPropagation();
              handleAction(n, () => onOpenLead(resourceId));
            }}
          >
            Ring nu
          </button>
        );

      case "goal_reached":
        return null;

      default:
        return null;
    }
  }

  return (
    <>
      {/* Backdrop */}
      <div
        className="fixed inset-0 z-40"
        onClick={onClose}
      />

      {/* Dropdown panel */}
      <div
        className="absolute right-12 top-12 z-50 w-[360px] max-h-[480px] flex flex-col rounded-lg shadow-lg border overflow-hidden"
        style={{
          background: "var(--color-bg-panel)",
          borderColor: "var(--color-border)",
        }}
      >
        {/* Header */}
        <div
          className="flex items-center justify-between px-4 py-3 border-b"
          style={{ borderColor: "var(--color-border)" }}
        >
          <div className="flex items-center gap-2">
            <span
              className="text-[12px] font-semibold"
              style={{ color: "var(--color-text-primary)" }}
            >
              Notiser
            </span>
            {unreadCount > 0 && (
              <span className="flex h-5 min-w-[20px] items-center justify-center rounded-full bg-red-500 px-1.5 text-[10px] font-bold text-white">
                {unreadCount}
              </span>
            )}
          </div>
          {unreadCount > 0 && (
            <button
              type="button"
              className="text-[11px] font-medium transition-colors hover:opacity-70"
              style={{ color: "var(--color-accent)" }}
              onClick={handleMarkAllRead}
            >
              Markera alla
            </button>
          )}
        </div>

        {/* Notification list */}
        <div className="flex-1 overflow-y-auto">
          {sorted.length === 0 ? (
            <div
              className="flex items-center justify-center py-10 text-[12px]"
              style={{ color: "var(--color-text-secondary)" }}
            >
              Inga notiser
            </div>
          ) : (
            sorted.map((n) => {
              const isUnread = !n.read_at;
              const isGoal = n.type === "goal_reached";

              return (
                <div
                  key={n.id}
                  className="flex gap-3 px-4 py-3 border-b transition-colors cursor-pointer hover:opacity-80"
                  style={{
                    borderColor: "var(--color-border)",
                    background: isGoal
                      ? "rgba(16, 185, 129, 0.06)"
                      : "transparent",
                  }}
                  onClick={() => handleNotificationClick(n)}
                >
                  {/* Unread dot */}
                  <div className="flex-shrink-0 pt-1.5 w-2">
                    {isUnread && (
                      <div
                        className="h-2 w-2 rounded-full"
                        style={{ background: "var(--color-accent)" }}
                      />
                    )}
                  </div>

                  {/* Content */}
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <p
                        className="text-[12px] font-semibold truncate"
                        style={{ color: "var(--color-text-primary)" }}
                      >
                        {n.title}
                      </p>
                      <span
                        className="text-[10px] flex-shrink-0"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {formatRelativeTime(n.inserted_at)}
                      </span>
                    </div>
                    {n.body && (
                      <p
                        className="text-[12px] mt-0.5 line-clamp-2"
                        style={{ color: "var(--color-text-secondary)" }}
                      >
                        {n.body}
                      </p>
                    )}
                    <div className="mt-2">
                      {renderActions(n)}
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>
    </>
  );
}
