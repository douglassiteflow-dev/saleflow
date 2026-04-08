import { useState } from "react";
import { useSendContract } from "@/api/contract-admin";
import { Button } from "@/components/ui/button";

interface SendContractFormProps {
  dealId: string;
  defaultEmail: string | null;
  defaultName: string | null;
  compact?: boolean;
}

export function SendContractForm({
  dealId,
  defaultEmail,
  defaultName: _defaultName,
  compact = false,
}: SendContractFormProps) {
  const [amount, setAmount] = useState("");
  const [terms, setTerms] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [sent, setSent] = useState(false);
  const sendContract = useSendContract();

  if (sent) {
    return (
      <p className={compact ? "text-[13px] text-emerald-700 font-medium" : "text-sm text-emerald-700 font-medium"}>
        Avtalet har skickats!
      </p>
    );
  }

  if (compact) {
    return (
      <div className="space-y-2">
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="Pris (SEK)"
          className="flex w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2.5 py-1.5 text-[13px]"
        />
        <textarea
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          placeholder="Villkor (valfritt)"
          rows={2}
          className="flex w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2.5 py-1.5 text-[13px] resize-y"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Kundens email"
          className="flex w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2.5 py-1.5 text-[13px]"
        />
        <button
          type="button"
          disabled={sendContract.isPending || !amount || !email}
          onClick={() => {
            sendContract.mutate(
              {
                dealId,
                amount: Number(amount),
                terms: terms || undefined,
                recipientEmail: email,
              },
              { onSuccess: () => setSent(true) },
            );
          }}
          className="w-full rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[13px] font-medium text-white hover:bg-[var(--color-accent-hover)] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sendContract.isPending ? "Skickar..." : "Skicka avtal"}
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div>
        <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)] mb-1">
          Pris (SEK)
        </label>
        <input
          type="number"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
          placeholder="0"
          className="flex w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm"
        />
      </div>
      <div>
        <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)] mb-1">
          Villkor
        </label>
        <textarea
          value={terms}
          onChange={(e) => setTerms(e.target.value)}
          placeholder="Avtalsvillkor (valfritt)"
          rows={3}
          className="flex w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm resize-y"
        />
      </div>
      <div>
        <label className="block text-[11px] font-medium uppercase tracking-widest text-[var(--color-text-secondary)] mb-1">
          Kundens email
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
        disabled={sendContract.isPending || !amount || !email}
        onClick={() => {
          sendContract.mutate(
            {
              dealId,
              amount: Number(amount),
              terms: terms || undefined,
              recipientEmail: email,
            },
            { onSuccess: () => setSent(true) },
          );
        }}
      >
        {sendContract.isPending ? "Skickar..." : "Skicka avtal"}
      </Button>
    </div>
  );
}
