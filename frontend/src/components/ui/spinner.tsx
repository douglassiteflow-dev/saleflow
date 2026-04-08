import { cn } from "@/lib/cn";

interface SpinnerProps {
  size?: "sm" | "md" | "lg";
  className?: string;
}

const SIZE_CLASSES: Record<NonNullable<SpinnerProps["size"]>, string> = {
  sm: "h-4 w-4",
  md: "h-6 w-6",
  lg: "h-8 w-8",
};

/**
 * Shared Spinner component.
 *
 * Renders a standard CSS spin animation with consistent sizing.
 * For full-page loading states prefer `Loader` from kokonutui/loader.
 */
export function Spinner({ size = "md", className }: SpinnerProps) {
  return (
    <span
      className={cn(
        "inline-block animate-spin rounded-full border-2 border-current border-t-transparent",
        SIZE_CLASSES[size],
        className,
      )}
      aria-hidden="true"
    />
  );
}
