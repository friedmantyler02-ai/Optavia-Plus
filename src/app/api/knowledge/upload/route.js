import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";
// pdf-parse imported dynamically below

const supabaseAdmin = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB

function titleFromFilename(filename) {
  return filename
    .replace(/\.pdf$/i, "")
    .replace(/[-_]+/g, " ")
    .replace(/\b\w/g, (c) => c.toUpperCase())
    .trim();
}

export async function POST(request) {
  try {
    // Auth
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const formData = await request.formData();
    const files = formData.getAll("files");

    if (!files || files.length === 0) {
      return NextResponse.json({ error: "No files provided" }, { status: 400 });
    }

    let uploaded = 0;
    let skipped = 0;
    const errors = [];

    for (const file of files) {
      const filename = file.name;

      // Validate PDF
      if (!filename.toLowerCase().endsWith(".pdf")) {
        errors.push(`${filename}: not a PDF file`);
        continue;
      }

      // Validate size
      if (file.size > MAX_FILE_SIZE) {
        errors.push(`${filename}: exceeds 10MB limit`);
        continue;
      }

      // Check for existing doc with same filename
      const { data: existing } = await supabaseAdmin
        .from("knowledge_documents")
        .select("id")
        .eq("filename", filename)
        .limit(1);

      if (existing && existing.length > 0) {
        skipped++;
        continue;
      }

      try {
        const buffer = Buffer.from(await file.arrayBuffer());
        const pdfParse = (await import("pdf-parse")).default;
        const parsed = await pdfParse(buffer);
        const content = parsed.text || "";

        if (!content.trim()) {
          errors.push(`${filename}: no text could be extracted`);
          continue;
        }

        const title = titleFromFilename(filename);

        const { error: insertError } = await supabaseAdmin
          .from("knowledge_documents")
          .insert({
            title,
            filename,
            content,
            created_at: new Date().toISOString(),
          });

        if (insertError) {
          errors.push(`${filename}: ${insertError.message}`);
          continue;
        }

        uploaded++;
      } catch (parseErr) {
        errors.push(`${filename}: failed to parse PDF`);
      }
    }

    return NextResponse.json({ uploaded, skipped, errors });
  } catch (err) {
    console.error("[knowledge/upload] Error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}

export async function DELETE(request) {
  try {
    // Auth
    const supabase = await createServerClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    const { id } = await request.json();

    if (!id) {
      return NextResponse.json({ error: "ID is required" }, { status: 400 });
    }

    const { error: deleteError } = await supabaseAdmin
      .from("knowledge_documents")
      .delete()
      .eq("id", id);

    if (deleteError) {
      return NextResponse.json({ error: deleteError.message }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (err) {
    console.error("[knowledge/upload] Delete error:", err);
    return NextResponse.json(
      { error: err.message || "Internal server error" },
      { status: 500 }
    );
  }
}
