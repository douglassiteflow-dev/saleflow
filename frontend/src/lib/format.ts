/**
 * Format a phone number from +46... form to 070-xxx xx xx Swedish style.
 * Falls back to the original string if it doesn't match the expected pattern.
 */
export function formatPhone(phone: string | null | undefined): string {
  if (!phone) return "";
  // Remove all spaces
  const cleaned = phone.replace(/\s/g, "");

  // +46XXXXXXXXX → 0XX-XXX XX XX
  if (cleaned.startsWith("+46")) {
    const local = "0" + cleaned.slice(3);
    // Format as 0XX-XXX XX XX (mobile) or 0XX-XX XX XX (10-digit)
    if (local.length === 10) {
      return `${local.slice(0, 3)}-${local.slice(3, 6)} ${local.slice(6, 8)} ${local.slice(8, 10)}`;
    }
    return local;
  }

  return phone;
}

/**
 * Format an ISO date string to Swedish locale date (e.g. "2024-03-15" → "15 mars 2024").
 */
export function formatDate(isoDate: string): string {
  const d = new Date(isoDate);
  if (isNaN(d.getTime())) return isoDate;
  return d.toLocaleDateString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });
}

/**
 * Format a time string "14:30:00" → "14:30".
 */
export function formatTime(time: string): string {
  if (!time) return time;
  // Already a HH:MM format
  const parts = time.split(":");
  if (parts.length >= 2) {
    return `${parts[0]}:${parts[1]}`;
  }
  return time;
}

/**
 * Format a number as Swedish currency in tkr (thousands).
 * E.g. 1500000 → "1 500 tkr"
 */
export function formatCurrency(value: number): string {
  const tkr = Math.round(value / 1000);
  return (
    tkr.toLocaleString("sv-SE", { maximumFractionDigits: 0 }) + " tkr"
  );
}

/**
 * Format a duration in seconds to a human-readable string.
 * E.g. 0 → "—", 45 → "45s", 125 → "2m 5s"
 */
export function formatDuration(seconds: number): string {
  if (!seconds || seconds === 0) return "—";
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return m > 0 ? `${m}m ${s}s` : `${s}s`;
}

/**
 * Ensure an ISO datetime string is treated as UTC.
 * Backend sends NaiveDateTime without timezone suffix — append Z if missing.
 */
function ensureUTC(iso: string): string {
  if (!iso.includes("T")) return iso;
  if (iso.endsWith("Z") || iso.includes("+", 10)) return iso;
  return iso + "Z";
}

/**
 * Format an ISO datetime string to Swedish locale date + time.
 * E.g. "2024-03-15T14:30:00" → "15 mars 2024, 16:30" (in CEST)
 */
export function formatDateTime(isoDatetime: string): string {
  const d = new Date(ensureUTC(isoDatetime));
  if (isNaN(d.getTime())) return isoDatetime;
  return d.toLocaleString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

/**
 * Format an ISO datetime string as relative time in Swedish.
 * E.g. "Just nu", "5 min sedan", "2 tim sedan", "3 dagar sedan"
 */
export function formatRelativeTime(isoDatetime: string): string {
  const d = new Date(ensureUTC(isoDatetime));
  if (isNaN(d.getTime())) return isoDatetime;

  const now = Date.now();
  const diffMs = now - d.getTime();
  const diffSec = Math.floor(diffMs / 1000);
  const diffMin = Math.floor(diffSec / 60);
  const diffHrs = Math.floor(diffMin / 60);
  const diffDays = Math.floor(diffHrs / 24);

  if (diffSec < 60) return "Just nu";
  if (diffMin < 60) return `${diffMin} min sedan`;
  if (diffHrs < 24) return `${diffHrs} tim sedan`;
  if (diffDays === 1) return "1 dag sedan";
  return `${diffDays} dagar sedan`;
}
