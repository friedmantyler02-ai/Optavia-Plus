// Bulk-ingest PDF files into knowledge_documents table.
//
// Usage: node scripts/ingest-pdfs.js <folder-path>
// Example: node scripts/ingest-pdfs.js ~/Dropbox/optavia-pdfs
//
// ⚠️  Run this in Supabase SQL Editor before first ingest:
// ALTER TABLE knowledge_documents ADD CONSTRAINT knowledge_documents_filename_unique UNIQUE (filename);

const fs = require("fs");
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env.local") });
const pdfParse = require("pdf-parse");
const { createClient } = require("@supabase/supabase-js");

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error("Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local");
  process.exit(1);
}

const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

function titleFromFilename(filename) {
  return filename
    .replace(/\.pdf$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

async function main() {
  const folderPath = process.argv[2];
  if (!folderPath) {
    console.error("Usage: node scripts/ingest-pdfs.js <folder-path>");
    process.exit(1);
  }

  const resolved = path.resolve(folderPath);
  if (!fs.existsSync(resolved)) {
    console.error(`Folder not found: ${resolved}`);
    process.exit(1);
  }

  const files = fs.readdirSync(resolved).filter((f) => f.toLowerCase().endsWith(".pdf"));
  if (files.length === 0) {
    console.log("No PDF files found in", resolved);
    process.exit(0);
  }

  // Fetch existing filenames to track new vs updated
  const { data: existing } = await supabase
    .from("knowledge_documents")
    .select("filename");
  const existingFilenames = new Set((existing || []).map((d) => d.filename));

  console.log(`Found ${files.length} PDF files in ${resolved}\n`);

  let newCount = 0;
  let updatedCount = 0;
  let errorCount = 0;

  for (let i = 0; i < files.length; i++) {
    const filename = files[i];
    const filePath = path.join(resolved, filename);
    process.stdout.write(`Processing ${i + 1}/${files.length}: ${filename}... `);

    try {
      const buffer = fs.readFileSync(filePath);
      const parsed = await pdfParse(buffer);
      const content = parsed.text || "";

      if (!content.trim()) {
        console.log("⚠️  no text extracted, skipping");
        errorCount++;
        continue;
      }

      const title = titleFromFilename(filename);

      const { error } = await supabase
        .from("knowledge_documents")
        .upsert(
          { title, filename, content, category: "general", created_at: new Date().toISOString() },
          { onConflict: "filename" }
        );

      if (error) {
        console.log("❌ " + error.message);
        errorCount++;
        continue;
      }

      if (existingFilenames.has(filename)) {
        updatedCount++;
        console.log("✅ (updated)");
      } else {
        newCount++;
        console.log("✅");
      }
    } catch (err) {
      console.log("❌ " + (err.message || "parse failed"));
      errorCount++;
    }
  }

  const total = newCount + updatedCount;
  const parts = [`${total} documents ingested`];
  if (newCount > 0) parts.push(`${newCount} new`);
  if (updatedCount > 0) parts.push(`${updatedCount} updated`);
  if (errorCount > 0) parts.push(`${errorCount} failed`);

  console.log(`\nDone! ${parts.join(", ")}`);
}

main();
