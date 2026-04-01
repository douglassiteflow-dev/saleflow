import { useRef, useState, useCallback, type KeyboardEvent, type ClipboardEvent } from "react";

interface OtpInputProps {
  onComplete: (code: string) => void;
  onResend?: () => void;
  error?: string | null;
  disabled?: boolean;
}

const OTP_LENGTH = 6;

export function OtpInput({ onComplete, onResend, error, disabled }: OtpInputProps) {
  const [digits, setDigits] = useState<string[]>(Array.from({ length: OTP_LENGTH }, () => ""));
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  const setRef = useCallback((index: number) => (el: HTMLInputElement | null) => {
    inputRefs.current[index] = el;
  }, []);

  function handleChange(index: number, value: string) {
    if (disabled) return;

    // Only accept single digit
    const digit = value.replace(/\D/g, "").slice(-1);

    const next = [...digits];
    next[index] = digit;
    setDigits(next);

    if (digit && index < OTP_LENGTH - 1) {
      inputRefs.current[index + 1]?.focus();
    }

    // Check if all filled
    if (digit && next.every((d) => d !== "")) {
      onComplete(next.join(""));
    }
  }

  function handleKeyDown(index: number, e: KeyboardEvent<HTMLInputElement>) {
    if (disabled) return;

    if (e.key === "Backspace") {
      if (!digits[index] && index > 0) {
        const next = [...digits];
        next[index - 1] = "";
        setDigits(next);
        inputRefs.current[index - 1]?.focus();
      } else {
        const next = [...digits];
        next[index] = "";
        setDigits(next);
      }
    }
  }

  function handlePaste(e: ClipboardEvent<HTMLInputElement>) {
    if (disabled) return;

    e.preventDefault();
    const pasted = e.clipboardData.getData("text").replace(/\D/g, "").slice(0, OTP_LENGTH);
    if (!pasted) return;

    const next = [...digits];
    for (let i = 0; i < OTP_LENGTH; i++) {
      next[i] = pasted[i] ?? "";
    }
    setDigits(next);

    // Focus last filled or last input
    const focusIndex = Math.min(pasted.length, OTP_LENGTH - 1);
    inputRefs.current[focusIndex]?.focus();

    if (next.every((d) => d !== "")) {
      onComplete(next.join(""));
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex justify-center gap-3" role="group" aria-label="Engångskod">
        {digits.map((digit, i) => (
          <input
            key={i}
            ref={setRef(i)}
            type="text"
            inputMode="numeric"
            maxLength={1}
            value={digit}
            disabled={disabled}
            aria-label={`Siffra ${i + 1}`}
            onChange={(e) => handleChange(i, e.target.value)}
            onKeyDown={(e) => handleKeyDown(i, e)}
            onPaste={handlePaste}
            autoFocus={i === 0}
            className="w-12 h-12 text-center font-mono text-xl rounded-[6px] border border-[var(--color-border-input)] bg-white text-[var(--color-text-primary)] transition-colors duration-150 focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)] disabled:opacity-50 disabled:cursor-not-allowed"
          />
        ))}
      </div>

      {error && (
        <p className="text-sm text-center text-[var(--color-danger)] bg-red-50 border border-red-200 rounded-md px-3 py-2">
          {error}
        </p>
      )}

      {onResend && (
        <p className="text-center">
          <button
            type="button"
            onClick={onResend}
            disabled={disabled}
            className="text-sm text-[var(--color-text-secondary)] hover:underline cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Skicka ny kod
          </button>
        </p>
      )}
    </div>
  );
}
