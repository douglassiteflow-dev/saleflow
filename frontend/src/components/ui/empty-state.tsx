interface EmptyStateProps {
  message: string;
}

/**
 * Shared EmptyState component.
 *
 * Renders a centered secondary-colored message for empty list/data states.
 */
export function EmptyState({ message }: EmptyStateProps) {
  return (
    <p className="text-sm text-[var(--color-text-secondary)] py-8 text-center">
      {message}
    </p>
  );
}
