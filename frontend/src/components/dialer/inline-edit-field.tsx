import { useState, useRef, useEffect } from "react";
import { cn } from "@/lib/cn";

interface InlineEditFieldProps {
  value: string;
  onSave: (value: string) => void;
  placeholder?: string;
  isLink?: boolean;
  className?: string;
}

export function InlineEditField({
  value,
  onSave,
  placeholder,
  isLink = false,
  className,
}: InlineEditFieldProps) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saved, setSaved] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
    }
  }, [editing]);

  function handleClick() {
    setDraft(value);
    setEditing(true);
  }

  function handleSave() {
    setEditing(false);
    if (draft !== value) {
      onSave(draft);
      setSaved(true);
      setTimeout(() => setSaved(false), 600);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditing(false);
      setDraft(value);
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        className={cn(
          "w-full text-[13px] text-[var(--color-text-primary)] bg-white border border-[#C7D2FE] rounded px-1.5 py-0.5 outline-none focus:ring-2 focus:ring-[#C7D2FE]",
          className,
        )}
      />
    );
  }

  const isEmpty = !value;

  return (
    <span
      role="button"
      tabIndex={0}
      onClick={handleClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") handleClick();
      }}
      className={cn(
        "cursor-pointer rounded px-1.5 py-0.5 text-[13px] transition-colors",
        "hover:bg-[#EEF2FF] hover:border hover:border-[#C7D2FE]",
        "border border-transparent",
        saved && "bg-emerald-50 border-emerald-200 text-emerald-700",
        isEmpty && "italic text-[var(--color-text-secondary)]",
        !isEmpty && "text-[var(--color-text-primary)]",
        className,
      )}
    >
      {isEmpty ? placeholder : `${value}${isLink ? " ↗" : ""}`}
    </span>
  );
}
