import { cn } from "@/lib/cn";

interface InfoRowProps {
  label: string;
  value?: string | number | null;
  mono?: boolean;
  bold?: boolean;
  children?: React.ReactNode;
}

/**
 * Shared InfoRow/DetailRow component.
 *
 * Renders a label + value pair with a bottom border.
 * Pass `children` to render a custom value (e.g. a button or anchor).
 * Returns null when `value` is null/undefined/"" and no children are provided.
 */
export function InfoRow({ label, value, mono, bold, children }: InfoRowProps) {
  const hasValue = value !== null && value !== undefined && value !== "";
  if (!hasValue && !children) return null;

  return (
    <div className="flex flex-col gap-0.5 py-2 border-b border-[var(--color-border)] last:border-0">
      <span className="text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)]">
        {label}
      </span>
      <span
        className={cn(
          "text-sm text-[var(--color-text-primary)]",
          mono && "font-mono text-[13px]",
          bold && "font-medium",
        )}
      >
        {children ?? value}
      </span>
    </div>
  );
}
