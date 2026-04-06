/**
 * Normalize a phone number for search comparison.
 * Strips +46 prefix, leading 0, spaces, dashes — keeps only digits.
 * "070123456" → "70123456"
 * "+4670123456" → "70123456"
 * "0046701234567" → "701234567"
 */
export function normalizePhone(phone: string): string {
  const digits = phone.replace(/[^0-9]/g, "");
  if (digits.startsWith("46") && digits.length > 8) return digits.slice(2);
  if (digits.startsWith("0046")) return digits.slice(4);
  if (digits.startsWith("0")) return digits.slice(1);
  return digits;
}

/**
 * Check if a phone number matches a search query.
 * Handles +46/0 equivalence automatically.
 */
export function phoneMatches(phone: string | null | undefined, query: string): boolean {
  if (!phone || !query) return false;
  return normalizePhone(phone).includes(normalizePhone(query));
}
