import { useState } from "react";
import { useCreateTeamsMeeting } from "@/api/microsoft";
import { formatDate, formatTime } from "@/lib/format";

interface SendInviteButtonProps {
  meetingId: string;
  teamsJoinUrl: string | null;
  attendeeEmail?: string | null;
  attendeeName?: string | null;
  leadEmail?: string | null;
  leadName?: string | null;
  meetingDate?: string;
  meetingTime?: string;
  size?: "sm" | "md";
  onSent?: () => void;
}

export function SendInviteButton({
  meetingId,
  teamsJoinUrl,
  attendeeEmail,
  attendeeName,
  leadEmail,
  leadName,
  meetingDate,
  meetingTime,
  size = "sm",
  onSent,
}: SendInviteButtonProps) {
  const [open, setOpen] = useState(false);
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const createTeamsMeeting = useCreateTeamsMeeting();

  // Don't render if invitation already sent
  if (teamsJoinUrl) return null;

  function handleOpen() {
    // Pre-fill: leadEmail -> attendeeEmail -> empty
    setEmail(leadEmail ?? attendeeEmail ?? "");
    // Pre-fill: attendeeName -> leadName -> empty
    setName(attendeeName ?? leadName ?? "");
    setOpen(true);
  }

  function handleSubmit() {
    createTeamsMeeting.mutate(
      {
        meetingId,
        email: email || undefined,
        name: name || undefined,
      },
      {
        onSuccess: () => {
          setOpen(false);
          onSent?.();
        },
      },
    );
  }

  const isSm = size === "sm";

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className={`inline-flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] text-white font-medium hover:opacity-90 transition-opacity cursor-pointer ${
          isSm
            ? "text-[11px] px-2.5 py-[3px]"
            : "text-sm h-10 px-4"
        }`}
        data-testid="send-invite-button"
      >
        <svg
          xmlns="http://www.w3.org/2000/svg"
          className={isSm ? "h-3 w-3" : "h-4 w-4"}
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect width="20" height="16" x="2" y="4" rx="2" />
          <path d="m22 7-8.97 5.7a1.94 1.94 0 0 1-2.06 0L2 7" />
        </svg>
        Skicka inbjudan
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm"
          onClick={() => setOpen(false)}
          data-testid="invite-modal-overlay"
        >
          <div
            className="bg-white rounded-lg w-full max-w-md mx-4 mt-[10vh] shadow-xl"
            onClick={(e) => e.stopPropagation()}
            data-testid="invite-modal"
          >
            {/* Header */}
            <div className="px-6 py-4 border-b border-[var(--color-border)]">
              <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
                Skicka Teams-inbjudan
              </h2>
            </div>

            {/* Body */}
            <div className="p-6 space-y-4">
              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
                  E-post
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="namn@foretag.se"
                  className="flex w-full rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)] transition-colors duration-150"
                  data-testid="invite-email-input"
                />
              </div>

              <div className="space-y-1.5">
                <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
                  Namn
                </label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="Namn"
                  className="flex w-full rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)] transition-colors duration-150"
                  data-testid="invite-name-input"
                />
              </div>

              {(meetingDate || meetingTime) && (
                <div className="space-y-1.5">
                  <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
                    Datum + tid
                  </label>
                  <p className="text-sm text-[var(--color-text-primary)]" data-testid="invite-datetime">
                    {meetingDate ? formatDate(meetingDate) : ""}
                    {meetingDate && meetingTime ? ", kl " : ""}
                    {meetingTime ? formatTime(meetingTime) : ""}
                  </p>
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)]">
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="inline-flex items-center justify-center gap-2 rounded-[6px] border font-medium transition-colors duration-150 cursor-pointer bg-white text-[var(--color-text-primary)] border-[var(--color-border-input)] hover:bg-[var(--color-bg-panel)] h-9 px-4 text-sm"
                disabled={createTeamsMeeting.isPending}
              >
                Avbryt
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={createTeamsMeeting.isPending}
                className="inline-flex items-center justify-center gap-2 rounded-[6px] border border-transparent font-medium transition-colors duration-150 cursor-pointer bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 h-9 px-4 text-sm"
                data-testid="invite-submit-button"
              >
                {createTeamsMeeting.isPending ? "Skickar..." : "Skicka"}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
