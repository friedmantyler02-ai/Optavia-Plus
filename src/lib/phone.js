/**
 * Normalize a phone value from an Optavia org CSV export.
 * Handles the =" prefix and " suffix (e.g. ="15551234567"),
 * strips all non-digit characters, and normalizes to 11 digits (1 + 10).
 * Returns the cleaned digits string or null if invalid.
 */
export function normalizeOrgCsvPhone(raw) {
  if (raw == null) return null;
  let value = raw.trim();
  if (!value) return null;

  // Strip =" prefix and " suffix from CSV export format
  if (value.startsWith('="')) value = value.slice(2);
  if (value.endsWith('"')) value = value.slice(0, -1);

  // Extract digits only
  const digits = value.replace(/\D/g, "");
  if (!digits) return null;

  // 11 digits starting with 1 → valid US number
  if (digits.length === 11 && digits.startsWith("1")) return digits;
  // 10 digits → prepend 1
  if (digits.length === 10) return `1${digits}`;

  return null;
}

/**
 * Format a phone string for display.
 * - 10-digit US: +1 (240) 222-2222
 * - 11-digit starting with 1: +1 (240) 222-2222
 * - Other/international: return as-is with + prefix
 * - null/empty: return ""
 */
export function formatPhoneDisplay(raw) {
  if (!raw) return "";
  const digits = String(raw).replace(/\D/g, "");
  if (!digits) return String(raw);

  let d = digits;
  if (d.length === 11 && d.startsWith("1")) {
    d = d.slice(1);
  }
  if (d.length === 10) {
    return `+1 (${d.slice(0, 3)}) ${d.slice(3, 6)}-${d.slice(6)}`;
  }

  // Non-US or unrecognized: return original with + if missing
  const s = String(raw).trim();
  return s.startsWith("+") ? s : `+${s}`;
}
