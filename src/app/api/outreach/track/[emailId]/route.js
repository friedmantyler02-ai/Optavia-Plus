import { createClient as createSupabaseClient } from "@supabase/supabase-js";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// 1x1 transparent GIF bytes
const TRANSPARENT_GIF = Buffer.from(
  "R0lGODlhAQABAIAAAAAAAP///yH5BAEAAAAALAAAAAABAAEAAAIBRAA7",
  "base64"
);

export async function GET(request, { params }) {
  const { emailId } = await params;

  // Fire-and-forget open tracking — never block the response
  if (emailId) {
    try {
      const { data: emailRow } = await supabaseAdmin
        .from("reactivation_emails")
        .select("id, status, campaign_id, opened_at")
        .eq("id", emailId)
        .single();

      if (emailRow && !emailRow.opened_at && emailRow.status === "sent") {
        const now = new Date().toISOString();

        // Mark as opened
        await supabaseAdmin
          .from("reactivation_emails")
          .update({ opened_at: now, status: "opened" })
          .eq("id", emailId)
          .eq("status", "sent"); // only update if still 'sent', don't overwrite 'replied'

        // Increment campaign total_opened
        if (emailRow.campaign_id) {
          const { data: camp } = await supabaseAdmin
            .from("reactivation_campaigns")
            .select("total_opened")
            .eq("id", emailRow.campaign_id)
            .single();

          await supabaseAdmin
            .from("reactivation_campaigns")
            .update({ total_opened: (camp?.total_opened || 0) + 1 })
            .eq("id", emailRow.campaign_id);
        }
      }
    } catch {
      // Never let tracking errors affect the image response
    }
  }

  return new Response(TRANSPARENT_GIF, {
    status: 200,
    headers: {
      "Content-Type": "image/gif",
      "Cache-Control": "no-cache, no-store, must-revalidate",
      "Pragma": "no-cache",
      "Expires": "0",
    },
  });
}
