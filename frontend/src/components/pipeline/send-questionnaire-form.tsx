import { useState } from "react";
import { useSendQuestionnaire } from "@/api/questionnaire-admin";
import { Button } from "@/components/ui/button";

interface SendQuestionnaireFormProps {
  dealId: string;
  defaultEmail: string | null;
  compact?: boolean;
}

export function SendQuestionnaireForm({
  dealId,
  defaultEmail,
  compact = false,
}: SendQuestionnaireFormProps) {
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [sent, setSent] = useState(false);
  const sendQuestionnaire = useSendQuestionnaire();

  if (sent) {
    return (
      <p className={compact ? "text-[13px] text-emerald-700 font-medium" : "text-sm text-emerald-700 font-medium"}>
        Formuläret har skickats!
      </p>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="kund@exempel.se"
          className="flex w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2.5 py-1.5 text-[13px]"
        />
        <button
          type="button"
          disabled={sendQuestionnaire.isPending || !email}
          onClick={() => {
            sendQuestionnaire.mutate(
              { dealId, customerEmail: email },
              { onSuccess: () => setSent(true) },
            );
          }}
          className="w-full rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sendQuestionnaire.isPending ? "Skickar..." : "Skicka formulär"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)] mb-1">
          Kundens e-post
        </label>
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="kund@exempel.se"
          className="flex w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm"
        />
      </div>
      <Button
        variant="primary"
        disabled={sendQuestionnaire.isPending || !email}
        onClick={() => {
          sendQuestionnaire.mutate(
            { dealId, customerEmail: email },
            { onSuccess: () => setSent(true) },
          );
        }}
      >
        {sendQuestionnaire.isPending ? "Skickar..." : "Skicka formulär"}
      </Button>
    </div>
  );
}
