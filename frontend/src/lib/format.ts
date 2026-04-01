/**
 * Format a phone number from +46... form to 070-xxx xx xx Swedish style.
 * Falls back to the original string if it doesn't match the expected pattern.
 */
export function formatPhone(phone: string): string {
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
 * Format an ISO datetime string to Swedish locale date + time.
 * E.g. "2024-03-15T14:30:00Z" → "15 mars 2024, 14:30"
 */
export function formatDateTime(isoDatetime: string): string {
  const d = new Date(isoDatetime);
  if (isNaN(d.getTime())) return isoDatetime;
  return d.toLocaleString("sv-SE", {
    year: "numeric",
    month: "long",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}
