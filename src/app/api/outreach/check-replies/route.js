import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { checkGmailThread, getValidGmailToken } from "@/lib/gmail";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

export async function POST(request) {
  try {
    // Auth via CRON_SECRET header
    const cronSecret = request.headers.get("x-cron-secret");
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Fetch all sent emails that have a thread_id and haven't been replied to yet
    const { data: sentEmails, error: fetchError } = await supabaseAdmin
      .from("reactivation_emails")
      .select("id, client_id, coach_id, campaign_id, gmail_thread_id, last_known_message_count")
      .eq("status", "sent")
      .not("gmail_thread_id", "is", null)
      .is("replied_at", null)
      .order("sent_at", { ascending: true });

    if (fetchError) {
      return NextResponse.json({ error: fetchError.message }, { status: 500 });
    }

    if (!sentEmails || sentEmails.length === 0) {
      return NextResponse.json({
        coaches_checked: 0,
        threads_checked: 0,
        replies_found: 0,
      });
    }

    // Group by coach_id
    const byCoach = {};
    for (const email of sentEmails) {
      if (!byCoach[email.coach_id]) byCoach[email.coach_id] = [];
      byCoach[email.coach_id].push(email);
    }

    let coachesChecked = 0;
    let threadsChecked = 0;
    let repliesFound = 0;

    for (const [coachId, emails] of Object.entries(byCoach)) {
      // Get valid Gmail token for this coach
      let tokenData;
      try {
        tokenData = await getValidGmailToken(coachId, supabaseAdmin);
      } catch (tokenErr) {
        console.error(`check-replies: Gmail token error for coach ${coachId} — ${tokenErr.message}`);
        coachesChecked++;
        continue;
      }

      // Process up to 50 emails per coach per run
      const batch = emails.slice(0, 50);

      for (const emailRow of batch) {
        try {
          let threadData;
          try {
            threadData = await checkGmailThread({
              accessToken: tokenData.accessToken,
              threadId: emailRow.gmail_thread_id,
            });
          } catch (threadErr) {
            // On auth error, refresh token once and retry
            if (
              threadErr.message.includes("401") ||
              threadErr.message.includes("403")
            ) {
              try {
                tokenData = await getValidGmailToken(coachId, supabaseAdmin);
                threadData = await checkGmailThread({
                  accessToken: tokenData.accessToken,
                  threadId: emailRow.gmail_thread_id,
                });
              } catch (retryErr) {
                console.error(
                  `check-replies: Retry failed for email ${emailRow.id} — ${retryErr.message}`
                );
                threadsChecked++;
                continue;
              }
            } else {
              console.error(
                `check-replies: Thread fetch failed for email ${emailRow.id} — ${threadErr.message}`
              );
              threadsChecked++;
              continue;
            }
          }

          threadsChecked++;

          const knownCount = emailRow.last_known_message_count || 1;

          if (threadData.messageCount > knownCount) {
            // New reply detected
            const now = new Date().toISOString();

            // Update the reactivation_email row
            await supabaseAdmin
              .from("reactivation_emails")
              .update({
                status: "replied",
                replied_at: now,
                reply_snippet: threadData.snippet,
                last_known_message_count: threadData.messageCount,
              })
              .eq("id", emailRow.id);

            // Increment campaign total_replied
            await supabaseAdmin.rpc("increment_campaign_replied", {
              p_campaign_id: emailRow.campaign_id,
            }).then(({ error: rpcErr }) => {
              if (rpcErr) {
                // Fallback: manual increment if RPC not available
                return supabaseAdmin
                  .from("reactivation_campaigns")
                  .select("total_replied")
                  .eq("id", emailRow.campaign_id)
                  .single()
                  .then(({ data: camp }) => {
                    return supabaseAdmin
                      .from("reactivation_campaigns")
                      .update({ total_replied: (camp?.total_replied || 0) + 1 })
                      .eq("id", emailRow.campaign_id);
                  });
              }
            });

            // Insert into reactivation_responses
            await supabaseAdmin.from("reactivation_responses").insert({
              email_id: emailRow.id,
              client_id: emailRow.client_id,
              coach_id: coachId,
              auto_detected: true,
              response_type: null,
              detected_at: now,
            });

            repliesFound++;
          } else {
            // Update last_known_message_count even if no new reply, to track state
            if (threadData.messageCount !== knownCount) {
              await supabaseAdmin
                .from("reactivation_emails")
                .update({ last_known_message_count: threadData.messageCount })
                .eq("id", emailRow.id);
            }
          }
        } catch (emailErr) {
          console.error(
            `check-replies: Unexpected error for email ${emailRow.id} — ${emailErr.message}`
          );
          // Continue to next email
        }
      }

      coachesChecked++;
    }

    return NextResponse.json({
      coaches_checked: coachesChecked,
      threads_checked: threadsChecked,
      replies_found: repliesFound,
    });
  } catch (err) {
    console.error("check-replies fatal error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
