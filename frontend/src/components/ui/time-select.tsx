/**
 * TimeSelect — two <select> dropdowns for hour (08-20) and minute (00,15,30,45).
 * Combines into "HH:MM" string via onChange.
 */

const SELECT_CLASS =
  "rounded-[6px] border border-[var(--color-border-input)] bg-white px-[var(--spacing-input-x)] py-[var(--spacing-input-y)] text-sm text-[var(--color-text-primary)] focus:outline-none focus:ring-2 focus:ring-[var(--color-accent)] focus:border-[var(--color-accent)] transition-colors duration-150 cursor-pointer";

const HOURS = Array.from({ length: 13 }, (_, i) => {
  const h = i + 8; // 08–20
  return String(h).padStart(2, "0");
});

const MINUTES = ["00", "15", "30", "45"];

interface TimeSelectProps {
  value: string; // "HH:MM" or ""
  onChange: (value: string) => void;
  disabled?: boolean;
}

export function TimeSelect({ value, onChange, disabled }: TimeSelectProps) {
  const [hour, minute] = value ? value.split(":") : ["", ""];

  function handleHour(e: React.ChangeEvent<HTMLSelectElement>) {
    const h = e.target.value;
    const m = minute && MINUTES.includes(minute) ? minute : "00";
    onChange(h ? `${h}:${m}` : "");
  }

  function handleMinute(e: React.ChangeEvent<HTMLSelectElement>) {
    const m = e.target.value;
    const h = hour && HOURS.includes(hour) ? hour : "08";
    onChange(m !== "" ? `${h}:${m}` : "");
  }

  return (
    <div className="flex items-center gap-2">
      <select
        value={hour && HOURS.includes(hour) ? hour : ""}
        onChange={handleHour}
        disabled={disabled}
        className={SELECT_CLASS}
        aria-label="Timme"
      >
        <option value="" disabled>
          Timme
        </option>
        {HOURS.map((h) => (
          <option key={h} value={h}>
            {h}
          </option>
        ))}
      </select>
      <span className="text-[var(--color-text-secondary)] select-none">:</span>
      <select
        value={minute && MINUTES.includes(minute) ? minute : ""}
        onChange={handleMinute}
        disabled={disabled}
        className={SELECT_CLASS}
        aria-label="Minut"
      >
        <option value="" disabled>
          Min
        </option>
        {MINUTES.map((m) => (
          <option key={m} value={m}>
            {m}
          </option>
        ))}
      </select>
    </div>
  );
}
