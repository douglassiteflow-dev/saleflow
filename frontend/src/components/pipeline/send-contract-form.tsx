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
  defaultName,
  compact = false,
}: SendContractFormProps) {
  const [amount, setAmount] = useState("");
  const [terms, setTerms] = useState("");
  const [email, setEmail] = useState(defaultEmail ?? "");
  const [recipientName, setRecipientName] = useState(defaultName ?? "");
  const [sent, setSent] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const sendContract = useSendContract();

  const isDisabled = sendContract.isPending || !amount || !email || !email.includes("@");

  function handleSend() {
    setError(null);
    sendContract.mutate(
      {
        dealId,
        amount: Number(amount),
        terms: terms || undefined,
        recipientEmail: email,
        recipientName: recipientName || undefined,
      },
      {
        onSuccess: () => setSent(true),
        onError: () => setError("Något gick fel. Försök igen."),
      },
    );
  }

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
          type="text"
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
          placeholder="Mottagarens namn"
          className="flex w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2.5 py-1.5 text-[13px]"
        />
        <input
          type="email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          placeholder="Kundens email"
          className="flex w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-2.5 py-1.5 text-[13px]"
        />
        {error && (
          <p className="text-[12px] text-red-600">{error}</p>
        )}
        <button
          type="button"
          disabled={isDisabled}
          onClick={handleSend}
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
          Mottagarens namn
        </label>
        <input
          type="text"
          value={recipientName}
          onChange={(e) => setRecipientName(e.target.value)}
          placeholder="Kundens namn"
          className="flex w-full rounded-md border border-[var(--color-border-input)] bg-[var(--color-bg-primary)] px-3 py-2 text-sm"
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
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}
      <Button
        variant="primary"
        disabled={isDisabled}
        onClick={handleSend}
      >
        {sendContract.isPending ? "Skickar..." : "Skicka avtal"}
      </Button>
    </div>
  );
}
