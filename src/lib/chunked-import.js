/**
 * Client-side chunked CSV import for Frontline order CSVs.
 * Splits parsed rows into batches of CHUNK_SIZE and sends each
 * as a separate POST to /api/clients/import-orders to avoid
 * Vercel's 10-second serverless function timeout.
 */

const CHUNK_SIZE = 100;

/**
 * @param {object[]} rows - Parsed CSV rows from Papa Parse
 * @param {(progress: { current: number, total: number, rowsProcessed: number, totalRows: number }) => void} onProgress
 * @returns {Promise<{ updated: number, created: number, alerts: number, errors: object[], failedBatches: number }>}
 */
export async function importCSVChunked(rows, onProgress) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + CHUNK_SIZE));
  }

  let updated = 0;
  let created = 0;
  let alerts = 0;
  let errors = [];
  let failedBatches = 0;

  for (let i = 0; i < chunks.length; i++) {
    const rowsProcessed = Math.min((i + 1) * CHUNK_SIZE, rows.length);
    onProgress({ current: i + 1, total: chunks.length, rowsProcessed, totalRows: rows.length });

    try {
      const res = await fetch("/api/clients/import-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ orders: chunks[i] }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errors.push({ batch: i + 1, error: data.error || `HTTP ${res.status}` });
        failedBatches++;
        continue;
      }

      const data = await res.json();
      updated += data.updated || 0;
      created += data.created || 0;
      alerts += data.alerts || 0;
      if (data.errors?.length) {
        errors = errors.concat(data.errors);
      }
    } catch {
      errors.push({ batch: i + 1, error: "Network error" });
      failedBatches++;
    }
  }

  return { updated, created, alerts, errors, failedBatches };
}
