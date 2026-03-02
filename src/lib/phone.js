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
