import { useEffect, useState } from "react";
import { useBookFollowup, usePreviewFollowupMail, type FollowupLanguage } from "@/api/followup";
import { TimeSelect } from "@/components/ui/time-select";
import { inputClass, labelClass } from "@/lib/form-styles";
import { todayISO } from "@/lib/date";

interface BookFollowupModalProps {
  demoConfigId: string;
  leadName: string;
  leadEmail: string | null;
  open: boolean;
  onClose: () => void;
}

const DEFAULT_MESSAGES: Record<FollowupLanguage, string> = {
  sv: "Vi pratade om några justeringar under mötet, så fyll gärna i formuläret nedan med dina preferenser så anpassar vi hemsidan.",
  en: "We talked about some adjustments during the meeting — please fill in the form below with your preferences so we can tailor the website.",
};

export function BookFollowupModal({
  demoConfigId,
  leadName,
  leadEmail,
  open,
  onClose,
}: BookFollowupModalProps) {
  const [step, setStep] = useState<1 | 2>(1);
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [language, setLanguage] = useState<FollowupLanguage>("sv");
  const [personalMessage, setPersonalMessage] = useState(DEFAULT_MESSAGES.sv);
  const [email, setEmail] = useState(leadEmail ?? "");

  const book = useBookFollowup();
  const preview = usePreviewFollowupMail(step === 2 ? demoConfigId : null, {
    meeting_date: date,
    meeting_time: time,
    personal_message: personalMessage,
    language,
  });

  useEffect(() => {
    if (book.isSuccess) {
      onClose();
      setStep(1);
      setDate("");
      setTime("");
      setLanguage("sv");
      setPersonalMessage(DEFAULT_MESSAGES.sv);
      setEmail(leadEmail ?? "");
    }
  }, [book.isSuccess, onClose, leadEmail]);

  // Sync email when leadEmail prop changes (e.g., opening modal for a different demo)
  useEffect(() => {
    setEmail(leadEmail ?? "");
  }, [leadEmail]);

  if (!open) return null;

  const canAdvance = !!date && !!time && !!email.trim();

  const handleLanguageChange = (lang: FollowupLanguage) => {
    if (personalMessage === DEFAULT_MESSAGES[language]) {
      setPersonalMessage(DEFAULT_MESSAGES[lang]);
    }
    setLanguage(lang);
  };

  const handleSubmit = () => {
    book.mutate({
      id: demoConfigId,
      meeting_date: date,
      meeting_time: time + ":00",
      personal_message: personalMessage,
      language,
      email: email.trim(),
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center bg-black/50 backdrop-blur-sm"
      onClick={onClose}
      data-testid="book-followup-overlay"
    >
      <div
        className="bg-white rounded-lg w-full max-w-2xl mx-4 mt-[5vh] shadow-xl"
        onClick={(e) => e.stopPropagation()}
        data-testid="book-followup-modal"
      >
        <div className="px-6 py-4 border-b border-[var(--color-border)]">
          <h2 className="text-lg font-semibold text-[var(--color-text-primary)]">
            Boka uppföljning med {leadName}
          </h2>
          <p className="text-xs text-[var(--color-text-secondary)] mt-1">Steg {step} av 2</p>
        </div>

        {step === 1 && (
          <div className="p-6 space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="followup-date">
                  Datum
                </label>
                <input
                  id="followup-date"
                  type="date"
                  min={todayISO()}
                  value={date}
                  onChange={(e) => setDate(e.target.value)}
                  className={inputClass}
                />
              </div>
              <div className="space-y-1.5">
                <label className={labelClass} htmlFor="followup-time">
                  Tid
                </label>
                <TimeSelect value={time} onChange={setTime} />
              </div>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="followup-email">
                Kundens e-post
              </label>
              <input
                id="followup-email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="namn@foretag.se"
                className={inputClass}
              />
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                Mailet (med möteslänk, preview och frågeformulär) skickas till denna adress.
              </p>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="followup-language">
                Språk
              </label>
              <select
                id="followup-language"
                value={language}
                onChange={(e) => handleLanguageChange(e.target.value as FollowupLanguage)}
                className={inputClass}
              >
                <option value="sv">Svenska</option>
                <option value="en">English</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className={labelClass} htmlFor="followup-message">
                Personligt meddelande
              </label>
              <textarea
                id="followup-message"
                value={personalMessage}
                onChange={(e) => setPersonalMessage(e.target.value)}
                rows={4}
                maxLength={500}
                className={`${inputClass} resize-y`}
              />
              <p className="text-[11px] text-[var(--color-text-secondary)]">
                {personalMessage.length}/500
              </p>
            </div>
          </div>
        )}

        {step === 2 && (
          <div className="p-6 space-y-4">
            <p className="text-[13px] text-[var(--color-text-secondary)]">
              Så här kommer mailet att se ut för kunden:
            </p>
            {preview.isLoading && <p className="text-[13px]">Laddar preview...</p>}
            {preview.data && (
              <div className="border border-[var(--color-border)] rounded-lg overflow-hidden">
                <div className="px-4 py-2 bg-[var(--color-bg-panel)] border-b border-[var(--color-border)]">
                  <p className="text-[11px] font-medium text-[var(--color-text-secondary)]">Ämne:</p>
                  <p className="text-[13px] font-medium text-[var(--color-text-primary)]">
                    {preview.data.subject}
                  </p>
                </div>
                <iframe
                  srcDoc={preview.data.html}
                  title="Email preview"
                  className="w-full h-96"
                />
              </div>
            )}
            {book.isError && (
              <p className="text-sm text-red-600">
                Det gick inte att skicka. Kontrollera att du har en Microsoft-anslutning och
                försök igen.
              </p>
            )}
          </div>
        )}

        <div className="flex justify-end gap-3 px-6 py-4 border-t border-[var(--color-border)]">
          <button
            type="button"
            onClick={step === 1 ? onClose : () => setStep(1)}
            disabled={book.isPending}
            className="inline-flex items-center justify-center gap-2 rounded-[6px] border font-medium transition-colors duration-150 cursor-pointer bg-white text-[var(--color-text-primary)] border-[var(--color-border-input)] hover:bg-[var(--color-bg-panel)] h-9 px-4 text-sm"
          >
            {step === 1 ? "Avbryt" : "Tillbaka"}
          </button>
          {step === 1 && (
            <button
              type="button"
              onClick={() => setStep(2)}
              disabled={!canAdvance}
              className="inline-flex items-center justify-center gap-2 rounded-[6px] border border-transparent font-medium transition-colors duration-150 cursor-pointer bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 h-9 px-4 text-sm"
            >
              Nästa
            </button>
          )}
          {step === 2 && (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={book.isPending}
              className="inline-flex items-center justify-center gap-2 rounded-[6px] border border-transparent font-medium transition-colors duration-150 cursor-pointer bg-[var(--color-accent)] text-white hover:opacity-90 disabled:opacity-50 h-9 px-4 text-sm"
            >
              {book.isPending ? "Skickar..." : "Skicka"}
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
