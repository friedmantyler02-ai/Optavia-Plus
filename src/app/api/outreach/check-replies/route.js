import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { checkGmailThread, getValidGmailToken } from "@/lib/gmail";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// Extract email addresses from a Gmail message payload (headers + body parts)
function extractEmailsFromPayload(payload) {
  const emails = new Set();
  const emailRegex = /[\w.+%-]+@[\w.-]+\.[a-zA-Z]{2,}/g;

  // Check headers
  for (const header of payload?.headers || []) {
    const name = header.name?.toLowerCase();
    if (["to", "x-original-to", "x-failed-recipients", "final-recipient"].includes(name)) {
      const matches = header.value?.match(emailRegex) || [];
      for (const m of matches) emails.add(m.toLowerCase());
    }
  }

  // Check body parts recursively
  function scanParts(parts) {
    for (const part of parts || []) {
      if (part.body?.data) {
        try {
          const decoded = Buffer.from(part.body.data, "base64").toString("utf-8");
          const matches = decoded.match(emailRegex) || [];
          for (const m of matches) emails.add(m.toLowerCase());
        } catch {
          // ignore decode errors
        }
      }
      if (part.parts) scanParts(part.parts);
    }
  }
  scanParts(payload?.parts);

  return [...emails];
}

export async function POST(request) {
  try {
    // Auth via CRON_SECRET header
    const cronSecret = request.headers.get("x-cron-secret");
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // ── PASS 1: Reply detection ──────────────────────────────────────────────

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

    // Group by coach_id
    const byCoach = {};
    for (const email of sentEmails || []) {
      if (!byCoach[email.coach_id]) byCoach[email.coach_id] = [];
      byCoach[email.coach_id].push(email);
    }

    // Also collect all coach IDs from active campaigns (for bounce pass)
    const { data: activeCoaches } = await supabaseAdmin
      .from("reactivation_campaigns")
      .select("coach_id")
      .eq("status", "active");

    for (const row of activeCoaches || []) {
      if (!byCoach[row.coach_id]) byCoach[row.coach_id] = [];
    }

    let coachesChecked = 0;
    let threadsChecked = 0;
    let repliesFound = 0;
    let bouncesFound = 0;

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

      // ── Reply detection: process up to 50 emails per coach per run ──
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
                console.error(`check-replies: Retry failed for email ${emailRow.id} — ${retryErr.message}`);
                threadsChecked++;
                continue;
              }
            } else {
              console.error(`check-replies: Thread fetch failed for email ${emailRow.id} — ${threadErr.message}`);
              threadsChecked++;
              continue;
            }
          }

          threadsChecked++;
          const knownCount = emailRow.last_known_message_count || 1;

          if (threadData.messageCount > knownCount) {
            const now = new Date().toISOString();

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
                return supabaseAdmin
                  .from("reactivation_campaigns")
                  .select("total_replied")
                  .eq("id", emailRow.campaign_id)
                  .single()
                  .then(({ data: camp }) =>
                    supabaseAdmin
                      .from("reactivation_campaigns")
                      .update({ total_replied: (camp?.total_replied || 0) + 1 })
                      .eq("id", emailRow.campaign_id)
                  );
              }
            });

            await supabaseAdmin.from("reactivation_responses").insert({
              email_id: emailRow.id,
              client_id: emailRow.client_id,
              coach_id: coachId,
              auto_detected: true,
              response_type: null,
              detected_at: now,
            });

            repliesFound++;
          } else if (threadData.messageCount !== knownCount) {
            await supabaseAdmin
              .from("reactivation_emails")
              .update({ last_known_message_count: threadData.messageCount })
              .eq("id", emailRow.id);
          }
        } catch (emailErr) {
          console.error(`check-replies: Unexpected error for email ${emailRow.id} — ${emailErr.message}`);
        }
      }

      // ── PASS 2: Bounce detection ─────────────────────────────────────────

      try {
        // Search for bounce/NDR messages in the last 2 days
        const bounceQuery = encodeURIComponent(
          "from:mailer-daemon OR from:postmaster subject:\"delivery status notification\" newer_than:2d"
        );
        const searchRes = await fetch(
          `https://gmail.googleapis.com/gmail/v1/users/me/messages?q=${bounceQuery}&maxResults=20`,
          { headers: { Authorization: `Bearer ${tokenData.accessToken}` } }
        );

        if (!searchRes.ok) {
          console.error(`check-replies: Bounce search failed for coach ${coachId} — ${searchRes.status}`);
        } else {
          const searchData = await searchRes.json();
          const bounceMessages = searchData.messages || [];

          for (const msg of bounceMessages) {
            try {
              // Fetch the full message to extract the bounced recipient
              const msgRes = await fetch(
                `https://gmail.googleapis.com/gmail/v1/users/me/messages/${msg.id}?format=full`,
                { headers: { Authorization: `Bearer ${tokenData.accessToken}` } }
              );
              if (!msgRes.ok) continue;

              const msgData = await msgRes.json();
              const extractedEmails = extractEmailsFromPayload(msgData.payload);

              // Exclude mailer-daemon addresses and the coach's own address
              const coachEmail = tokenData.gmailAddress?.toLowerCase();
              const candidateEmails = extractedEmails.filter(
                (e) =>
                  !e.includes("mailer-daemon") &&
                  !e.includes("postmaster") &&
                  e !== coachEmail
              );

              for (const bouncedEmail of candidateEmails) {
                // Find a sent reactivation_email for this coach + email address
                const { data: matchedEmails } = await supabaseAdmin
                  .from("reactivation_emails")
                  .select("id, campaign_id, client_id")
                  .eq("coach_id", coachId)
                  .eq("status", "sent")
                  .is("bounced_at", null)
                  .limit(1)
                  .then(async ({ data: rows }) => {
                    if (!rows?.length) return { data: null };
                    // Filter by joining on client email
                    const clientIds = rows.map((r) => r.client_id);
                    const { data: clients } = await supabaseAdmin
                      .from("clients")
                      .select("id, email")
                      .in("id", clientIds)
                      .ilike("email", bouncedEmail);
                    if (!clients?.length) return { data: null };
                    const matchedClientIds = new Set(clients.map((c) => c.id));
                    return {
                      data: rows.filter((r) => matchedClientIds.has(r.client_id)),
                    };
                  });

                for (const emailRow of matchedEmails || []) {
                  const now = new Date().toISOString();

                  await supabaseAdmin
                    .from("reactivation_emails")
                    .update({ status: "bounced", bounced_at: now })
                    .eq("id", emailRow.id);

                  await supabaseAdmin
                    .from("clients")
                    .update({ bad_email: true })
                    .eq("id", emailRow.client_id);

                  // Increment campaign total_bounced
                  const { data: camp } = await supabaseAdmin
                    .from("reactivation_campaigns")
                    .select("total_bounced")
                    .eq("id", emailRow.campaign_id)
                    .single();

                  await supabaseAdmin
                    .from("reactivation_campaigns")
                    .update({ total_bounced: (camp?.total_bounced || 0) + 1 })
                    .eq("id", emailRow.campaign_id);

                  bouncesFound++;
                }
              }
            } catch (bounceErr) {
              console.error(`check-replies: Error processing bounce msg ${msg.id} — ${bounceErr.message}`);
            }
          }
        }
      } catch (bouncePassErr) {
        console.error(`check-replies: Bounce pass error for coach ${coachId} — ${bouncePassErr.message}`);
        // Don't let bounce detection failure affect the rest
      }

      coachesChecked++;
    }

    return NextResponse.json({
      coaches_checked: coachesChecked,
      threads_checked: threadsChecked,
      replies_found: repliesFound,
      bounces_found: bouncesFound,
    });
  } catch (err) {
    console.error("check-replies fatal error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
