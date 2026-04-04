import { cn } from "@/lib/cn";

interface ActionBarProps {
  phone: string;
  rawPhone: string;
  onSkip: () => void;
  onNext: () => void;
  isSkipping?: boolean;
  isNexting?: boolean;
}

export function ActionBar({
  phone,
  rawPhone,
  onSkip,
  onNext,
  isSkipping,
  isNexting,
}: ActionBarProps) {
  const anyPending = isSkipping || isNexting;

  return (
    <div className="flex items-center gap-2.5 px-5 py-2.5 bg-[var(--color-bg-primary)] border-b border-[var(--color-border)]">
      {/* Call link */}
      <a
        href={`tel:${rawPhone}`}
        className={cn(
          "flex items-center gap-1.5 rounded-lg px-[18px] py-[7px] text-[13px] font-semibold text-white no-underline",
          "bg-[var(--color-success)] hover:brightness-110 transition-all",
        )}
      >
        <svg
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
        >
          <path d="M22 16.92v3a2 2 0 01-2.18 2 19.79 19.79 0 01-8.63-3.07 19.5 19.5 0 01-6-6 19.79 19.79 0 01-3.07-8.67A2 2 0 014.11 2h3a2 2 0 012 1.72c.127.96.361 1.903.7 2.81a2 2 0 01-.45 2.11L8.09 9.91a16 16 0 006 6l1.27-1.27a2 2 0 012.11-.45c.907.339 1.85.573 2.81.7A2 2 0 0122 16.92z" />
        </svg>
        Ring
      </a>

      {/* Phone number */}
      <span className="font-mono text-sm text-[var(--color-text-primary)] bg-[var(--color-bg-panel)] px-3.5 py-[7px] rounded-lg border border-[var(--color-border)]">
        {phone}
      </span>

      {/* Spacer */}
      <div className="flex-1" />

      {/* Skip button */}
      <button
        type="button"
        onClick={onSkip}
        disabled={anyPending}
        className={cn(
          "rounded-lg border border-[var(--color-border)] bg-transparent px-3.5 py-[7px] text-[13px] text-[var(--color-text-secondary)] cursor-pointer",
          "hover:bg-[var(--color-bg-panel)] transition-colors",
          "disabled:opacity-50 disabled:pointer-events-none",
        )}
      >
        {isSkipping ? "Hoppar..." : "Hoppa över"}
      </button>

      {/* Next customer button */}
      <button
        type="button"
        onClick={onNext}
        disabled={anyPending}
        className={cn(
          "rounded-lg bg-[var(--color-accent)] px-3.5 py-[7px] text-[13px] font-medium text-white cursor-pointer",
          "hover:brightness-110 transition-all border border-transparent",
          "disabled:opacity-50 disabled:pointer-events-none",
        )}
      >
        {isNexting ? "Laddar..." : "Nästa kund →"}
      </button>
    </div>
  );
}
