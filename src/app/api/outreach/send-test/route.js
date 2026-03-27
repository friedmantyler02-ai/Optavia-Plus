import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { createClient as createServerClient } from "@/lib/supabase-server";
import { sendGmailEmail, getValidGmailToken } from "@/lib/gmail";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

async function authCheck() {
  const supabase = await createServerClient();
  const {
    data: { user },
    error,
  } = await supabase.auth.getUser();
  if (error || !user) return null;
  return user;
}

export async function POST(request) {
  try {
    const user = await authCheck();
    if (!user)
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

    const { coach_id, subject, body } = await request.json();

    if (!coach_id) {
      return NextResponse.json(
        { error: "coach_id is required" },
        { status: 400 }
      );
    }

    // Get coach info
    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("full_name")
      .eq("id", coach_id)
      .single();

    const coachName = coach?.full_name || "Your Coach";

    // Get valid Gmail token
    const tokenData = await getValidGmailToken(coach_id, supabaseAdmin);

    // Render template with sample data
    const renderedSubject = (subject || "")
      .replace(/\{\{FirstName\}\}/g, "Sarah")
      .replace(/\{\{CoachName\}\}/g, coachName);
    const renderedBody = (body || "")
      .replace(/\{\{FirstName\}\}/g, "Sarah")
      .replace(/\{\{CoachName\}\}/g, coachName);

    // Send test email to the coach's own Gmail
    const result = await sendGmailEmail({
      accessToken: tokenData.accessToken,
      to: tokenData.gmailAddress,
      subject: `[TEST] ${renderedSubject}`,
      body: renderedBody,
      fromName: coachName,
      fromEmail: tokenData.gmailAddress,
    });

    return NextResponse.json({ success: true, messageId: result.messageId });
  } catch (err) {
    console.error("send-test error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Failed to send test email" },
      { status: 500 }
    );
  }
}
