import { forwardRef, type ButtonHTMLAttributes } from "react";
import { cn } from "@/lib/cn";

export type ButtonVariant = "primary" | "secondary" | "danger" | "outcome";
export type ButtonSize = "default" | "lg";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
}

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    "bg-indigo-600 text-white hover:bg-indigo-700 focus-visible:ring-indigo-500 border-transparent",
  secondary:
    "bg-white text-[var(--color-text-primary)] border-[var(--color-border-input)] hover:bg-[var(--color-bg-panel)] focus-visible:ring-[var(--color-accent)]",
  danger:
    "bg-rose-600 text-white hover:bg-rose-700 focus-visible:ring-rose-500 border-transparent",
  outcome:
    "bg-white text-[var(--color-text-primary)] border-2 border-[var(--color-border-input)] hover:bg-[var(--color-bg-panel)] focus-visible:ring-[var(--color-accent)]",
};

const sizeClasses: Record<ButtonSize, string> = {
  default: "h-9 px-[var(--spacing-button-x)] py-[var(--spacing-button-y)] text-sm",
  lg: "h-12 px-[var(--spacing-button-x)] py-[var(--spacing-button-y)] text-base",
};

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  (
    { variant = "primary", size = "default", className, children, ...props },
    ref,
  ) => {
    return (
      <button
        ref={ref}
        className={cn(
          "inline-flex items-center justify-center gap-2 rounded-[6px] border font-medium",
          "transition-colors duration-150 cursor-pointer",
          "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-offset-2",
          "disabled:pointer-events-none disabled:opacity-50",
          variantClasses[variant],
          sizeClasses[size],
          className,
        )}
        {...props}
      >
        {children}
      </button>
    );
  },
);

Button.displayName = "Button";
