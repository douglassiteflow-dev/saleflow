import { useState } from "react";
import { useCreateMeeting } from "@/api/meetings";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

interface MeetingFormProps {
  onCancel: () => void;
}

export function MeetingForm({ onCancel }: MeetingFormProps) {
  const [leadId, setLeadId] = useState("");
  const [title, setTitle] = useState("");
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);

  const createMeeting = useCreateMeeting();

  function reset() {
    setLeadId("");
    setTitle("");
    setDate("");
    setTime("");
    setNotes("");
    setError(null);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!leadId.trim() || !title.trim() || !date || !time) {
      setError("Kund-ID, titel, datum och tid är obligatoriska.");
      return;
    }

    const scheduled_at = new Date(`${date}T${time}:00`).toISOString();

    try {
      await createMeeting.mutateAsync({
        lead_id: leadId.trim(),
        title: title.trim(),
        scheduled_at,
        notes: notes.trim() || undefined,
      });
      reset();
      onCancel();
    } catch (err) {
      setError((err as Error).message ?? "Något gick fel.");
    }
  }

  return (
    <form
      onSubmit={(e) => void handleSubmit(e)}
      className="rounded-lg border border-[var(--color-border)] bg-[var(--color-bg-panel)] p-5 space-y-4"
    >
      <p
        className="font-medium text-[var(--color-text-primary)]"
        style={{ fontSize: "15px" }}
      >
        Nytt möte
      </p>

      {error && (
        <p className="text-sm text-[var(--color-danger)]">{error}</p>
      )}

      <div className="grid gap-4" style={{ gridTemplateColumns: "1fr 1fr" }}>
        <div className="space-y-1">
          <label
            className="block text-[var(--color-text-secondary)] uppercase tracking-wider"
            style={{ fontSize: "12px" }}
          >
            Kund-ID
          </label>
          <Input
            value={leadId}
            onChange={(e) => setLeadId(e.target.value)}
            placeholder="lead-uuid"
          />
        </div>

        <div className="space-y-1">
          <label
            className="block text-[var(--color-text-secondary)] uppercase tracking-wider"
            style={{ fontSize: "12px" }}
          >
            Titel
          </label>
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Mötesbeskrivning"
          />
        </div>

        <div className="space-y-1">
          <label
            className="block text-[var(--color-text-secondary)] uppercase tracking-wider"
            style={{ fontSize: "12px" }}
          >
            Datum
          </label>
          <Input
            type="date"
            value={date}
            onChange={(e) => setDate(e.target.value)}
          />
        </div>

        <div className="space-y-1">
          <label
            className="block text-[var(--color-text-secondary)] uppercase tracking-wider"
            style={{ fontSize: "12px" }}
          >
            Tid
          </label>
          <Input
            type="time"
            value={time}
            onChange={(e) => setTime(e.target.value)}
          />
        </div>
      </div>

      <div className="space-y-1">
        <label
          className="block text-[var(--color-text-secondary)] uppercase tracking-wider"
          style={{ fontSize: "12px" }}
        >
          Anteckningar
        </label>
        <Input
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Valfria anteckningar..."
        />
      </div>

      <div className="flex gap-3 pt-1">
        <Button
          type="submit"
          variant="primary"
          disabled={createMeeting.isPending}
        >
          {createMeeting.isPending ? "Sparar..." : "Spara möte"}
        </Button>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Avbryt
        </Button>
      </div>
    </form>
  );
}
