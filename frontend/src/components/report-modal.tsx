import { useState, useEffect } from "react";
import { useCreateRequest } from "@/api/requests";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/cn";

interface ReportModalProps {
  onClose: () => void;
}

export function ReportModal({ onClose }: ReportModalProps) {
  const [type, setType] = useState<"bug" | "feature">("bug");
  const [description, setDescription] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const createRequest = useCreateRequest();

  // Auto-close after 2 seconds on success
  useEffect(() => {
    if (success) {
      const timer = setTimeout(() => {
        onClose();
      }, 2000);
      return () => clearTimeout(timer);
    }
  }, [success, onClose]);

  // Close on Escape
  useEffect(() => {
    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "Escape") onClose();
    }
    document.addEventListener("keydown", handleKeyDown);
    return () => document.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!description.trim()) {
      setError("Beskrivning är obligatorisk.");
      return;
    }

    try {
      await createRequest.mutateAsync({ type, description: description.trim() });
      setSuccess(true);
    } catch (err) {
      setError((err as Error).message ?? "Något gick fel.");
    }
  }

  return (
    // Backdrop
    <div
      className="fixed inset-0 z-50 flex items-center justify-center"
      style={{ backgroundColor: "rgba(0,0,0,0.4)", backdropFilter: "blur(2px)" }}
      onClick={onClose}
    >
      {/* Modal */}
      <div
        className="relative bg-white rounded-lg shadow-xl w-full mx-4"
        style={{ maxWidth: "512px" }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 pt-6 pb-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Rapportera bugg eller önska funktion
          </h2>
          <button
            onClick={onClose}
            className="text-[var(--color-text-secondary)] hover:text-[var(--color-text-primary)] transition-colors"
            aria-label="Stäng"
          >
            <svg width="20" height="20" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2">
              <path d="M15 5L5 15M5 5l10 10" strokeLinecap="round" />
            </svg>
          </button>
        </div>

        {/* Body */}
        <form onSubmit={(e) => void handleSubmit(e)} className="px-6 py-5 space-y-5">
          {success ? (
            <div className="py-6 flex flex-col items-center gap-3">
              <div className="w-12 h-12 rounded-full bg-emerald-50 flex items-center justify-center">
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="text-emerald-600">
                  <path d="M20 6L9 17l-5-5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
              </div>
              <p className="text-[var(--color-text-primary)] font-medium text-center">
                Tack! Din rapport har skickats.
              </p>
              <p className="text-sm text-[var(--color-text-secondary)] text-center">
                Stänger automatiskt...
              </p>
            </div>
          ) : (
            <>
              {/* Type selector */}
              <div className="space-y-1.5">
                <p
                  className="text-[var(--color-text-secondary)] uppercase tracking-wider font-medium"
                  style={{ fontSize: "12px" }}
                >
                  Typ
                </p>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={() => setType("bug")}
                    className={cn(
                      "flex-1 py-2 px-3 rounded-[6px] text-sm font-medium border transition-colors duration-150",
                      type === "bug"
                        ? "bg-rose-50 text-rose-700 border-rose-300"
                        : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border-input)] hover:bg-rose-50 hover:text-rose-700 hover:border-rose-200"
                    )}
                  >
                    Bugg
                  </button>
                  <button
                    type="button"
                    onClick={() => setType("feature")}
                    className={cn(
                      "flex-1 py-2 px-3 rounded-[6px] text-sm font-medium border transition-colors duration-150",
                      type === "feature"
                        ? "bg-indigo-50 text-indigo-700 border-indigo-300"
                        : "bg-white text-[var(--color-text-secondary)] border-[var(--color-border-input)] hover:bg-indigo-50 hover:text-indigo-700 hover:border-indigo-200"
                    )}
                  >
                    Funktion
                  </button>
                </div>
              </div>

              {/* Description */}
              <div className="space-y-1.5">
                <label
                  className="block text-[var(--color-text-secondary)] uppercase tracking-wider font-medium"
                  style={{ fontSize: "12px" }}
                >
                  Beskrivning
                </label>
                <textarea
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Beskriv vad du vill ändra eller rapportera..."
                  rows={4}
                  className="w-full rounded-[6px] border border-[var(--color-border-input)] bg-white px-3 py-2 text-sm text-[var(--color-text-primary)] placeholder:text-[var(--color-text-secondary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)] resize-none transition-colors duration-150"
                />
              </div>

              {error && (
                <p className="text-sm text-[var(--color-danger)]">{error}</p>
              )}

              {/* Actions */}
              <div className="flex gap-3 pt-1">
                <Button
                  type="submit"
                  variant="primary"
                  disabled={createRequest.isPending}
                  className="flex-1"
                >
                  {createRequest.isPending ? "Skickar..." : "Skicka"}
                </Button>
                <Button type="button" variant="secondary" onClick={onClose}>
                  Avbryt
                </Button>
              </div>
            </>
          )}
        </form>
      </div>
    </div>
  );
}
