/**
 * Client-side chunked CSV import.
 *
 * Auto-detects whether the CSV is an **organization/frontline** export
 * (has CurrentCoachID column) or an **order** export, and routes to the
 * correct API endpoint:
 *   - Org CSV  → /api/org/import   (creates coach stubs + links clients)
 *   - Order CSV → /api/clients/import-orders
 */

const CHUNK_SIZE = 100;
const ORG_CHUNK_SIZE = 500;

/**
 * Normalizes a header key — strips BOM, ="" wrapping, whitespace.
 */
function cleanHeader(h) {
  if (!h) return "";
  return h.replace(/^\uFEFF/, "").replace(/^="?/, "").replace(/"$/, "").trim();
}

/**
 * Detect if the CSV is an organization/frontline CSV by checking for
 * org-specific columns in the first row's keys.
 */
function isOrgCsv(rows) {
  if (!rows || rows.length === 0) return false;
  const keys = Object.keys(rows[0]).map(cleanHeader);
  return keys.includes("CurrentCoachID") || keys.includes("CurrentCoachName");
}

/**
 * Import an organization CSV via /api/org/import.
 */
async function importOrgChunked(rows, onProgress) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += ORG_CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + ORG_CHUNK_SIZE));
  }

  let batchId = null;
  let totalCoachesCreated = 0;
  let totalCoachesExisting = 0;
  let totalClientsInserted = 0;
  let totalClientsUpdated = 0;
  let totalLinked = 0;
  let errors = [];
  let failedBatches = 0;

  for (let i = 0; i < chunks.length; i++) {
    const rowsProcessed = Math.min((i + 1) * ORG_CHUNK_SIZE, rows.length);
    onProgress({ current: i + 1, total: chunks.length, rowsProcessed, totalRows: rows.length });

    try {
      const res = await fetch("/api/org/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rows: chunks[i],
          chunkIndex: i,
          totalChunks: chunks.length,
          batchId,
          filename: "import.csv",
          totalRows: rows.length,
        }),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        errors.push({ batch: i + 1, error: data.error || `HTTP ${res.status}` });
        failedBatches++;
        continue;
      }

      const data = await res.json();
      if (data.batchId) batchId = data.batchId;
      totalCoachesCreated += data.coachesCreated || 0;
      totalCoachesExisting += data.coachesExisting || 0;
      totalClientsInserted += data.clientsInserted || 0;
      totalClientsUpdated += data.clientsUpdated || 0;
      totalLinked += data.recordsLinked || 0;
      if (data.errorDetails?.length) {
        errors = errors.concat(data.errorDetails);
      }
    } catch {
      errors.push({ batch: i + 1, error: "Network error" });
      failedBatches++;
    }
  }

  return {
    updated: totalClientsUpdated,
    created: totalClientsInserted,
    alerts: 0,
    errors,
    failedBatches,
    orgImport: true,
    coachesCreated: totalCoachesCreated,
    coachesExisting: totalCoachesExisting,
    recordsLinked: totalLinked,
  };
}

/**
 * Import an order CSV via /api/clients/import-orders.
 */
async function importOrdersChunked(rows, onProgress) {
  const chunks = [];
  for (let i = 0; i < rows.length; i += CHUNK_SIZE) {
    chunks.push(rows.slice(i, i + CHUNK_SIZE));
  }

  let updated = 0;
  let created = 0;
  let alerts = 0;
  let errors = [];
  let failedBatches = 0;
  let ordersImported = 0;
  let ordersPending = 0;
  let orderErrors = [];

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
      ordersImported += data.ordersImported || 0;
      ordersPending += data.ordersPending || 0;
      if (data.orderErrors?.length) {
        orderErrors = orderErrors.concat(data.orderErrors);
      }
      if (data.errors?.length) {
        errors = errors.concat(data.errors);
      }
    } catch {
      errors.push({ batch: i + 1, error: "Network error" });
      failedBatches++;
    }
  }

  return { updated, created, alerts, errors, failedBatches, ordersImported, ordersPending, orderErrors };
}

/**
 * @param {object[]} rows - Parsed CSV rows from Papa Parse
 * @param {(progress: { current: number, total: number, rowsProcessed: number, totalRows: number }) => void} onProgress
 * @returns {Promise<{ updated: number, created: number, alerts: number, errors: object[], failedBatches: number }>}
 */
export async function importCSVChunked(rows, onProgress) {
  if (isOrgCsv(rows)) {
    return importOrgChunked(rows, onProgress);
  }
  return importOrdersChunked(rows, onProgress);
}
