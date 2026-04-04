import { useState } from "react";
import { useLeadComments, useCreateComment } from "@/api/comments";
import { cn } from "@/lib/cn";

interface LeadCommentsProps {
  leadId: string;
}

function formatCommentDate(iso: string): string {
  const d = new Date(iso);
  const day = d.getDate();
  const months = [
    "jan", "feb", "mar", "apr", "maj", "jun",
    "jul", "aug", "sep", "okt", "nov", "dec",
  ];
  return `${day} ${months[d.getMonth()]}`;
}

export function LeadComments({ leadId }: LeadCommentsProps) {
  const { data: comments, isLoading } = useLeadComments(leadId);
  const createComment = useCreateComment();
  const [text, setText] = useState("");

  function handleSubmit() {
    const trimmed = text.trim();
    if (!trimmed || createComment.isPending) return;

    createComment.mutate(
      { leadId, text: trimmed },
      {
        onSuccess: () => setText(""),
      },
    );
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSubmit();
    }
  }

  return (
    <div className="flex flex-col gap-1.5">
      <p className="text-[11px] font-medium uppercase tracking-[0.5px] text-[var(--color-text-secondary)] mb-0.5">
        Kommentarer
      </p>

      {isLoading && (
        <p className="text-xs text-[var(--color-text-secondary)]">Laddar...</p>
      )}

      {/* Comment list */}
      {comments?.map((comment) => (
        <div
          key={comment.id}
          className="rounded-md bg-[var(--color-bg-panel)] px-2.5 py-[7px] text-xs"
        >
          <div className="flex justify-between mb-0.5">
            <span className="font-medium text-[var(--color-text-primary)]">
              {comment.user_name}
            </span>
            <span className="text-[10px] text-[var(--color-text-secondary)]">
              {formatCommentDate(comment.inserted_at)}
            </span>
          </div>
          <p className="text-[var(--color-text-secondary)] leading-snug m-0">
            {comment.text}
          </p>
        </div>
      ))}

      {/* Input row */}
      <div className="flex gap-1.5">
        <input
          type="text"
          value={text}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Kommentar..."
          className={cn(
            "flex-1 rounded-md border border-[var(--color-border-input)] px-2 py-[5px] text-xs",
            "text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)]",
            "font-[inherit] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)]",
          )}
        />
        <button
          type="button"
          onClick={handleSubmit}
          disabled={createComment.isPending || !text.trim()}
          className={cn(
            "rounded-md bg-[var(--color-accent)] px-2.5 py-[5px] text-[11px] font-medium text-white cursor-pointer",
            "hover:brightness-110 transition-all",
            "disabled:opacity-50 disabled:pointer-events-none",
          )}
        >
          Spara
        </button>
      </div>
    </div>
  );
}
