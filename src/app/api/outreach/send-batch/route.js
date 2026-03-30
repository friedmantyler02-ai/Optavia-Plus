import { NextResponse } from "next/server";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { sendGmailEmail, getValidGmailToken } from "@/lib/gmail";

const supabaseAdmin = createSupabaseClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

function getDailyLimit(warmupDay) {
  if (warmupDay <= 2) return 20;
  if (warmupDay <= 4) return 40;
  if (warmupDay <= 7) return 60;
  return 100;
}

function randomDelay(minMs, maxMs) {
  return new Promise((resolve) =>
    setTimeout(resolve, minMs + Math.random() * (maxMs - minMs))
  );
}

function renderTemplate(text, firstName, coachName) {
  return text
    .replace(/\{\{FirstName\}\}/g, firstName)
    .replace(/\{\{CoachName\}\}/g, coachName);
}

export async function POST(request) {
  try {
    // Auth: require CRON_SECRET header
    const cronSecret = request.headers.get("x-cron-secret");
    if (cronSecret !== process.env.CRON_SECRET) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
    }

    // Weekday guard — no sends on Saturday (6) or Sunday (0) UTC
    const dayOfWeek = new Date().getUTCDay();
    if (dayOfWeek === 0 || dayOfWeek === 6) {
      return NextResponse.json({
        message: "Skipping — weekends only",
        campaigns_processed: 0,
        emails_sent: 0,
        errors: 0,
      });
    }

    // Find all active campaigns
    const { data: campaigns, error: campError } = await supabaseAdmin
      .from("reactivation_campaigns")
      .select("*")
      .eq("status", "active");

    if (campError) {
      return NextResponse.json({ error: campError.message }, { status: 500 });
    }

    if (!campaigns || campaigns.length === 0) {
      return NextResponse.json({
        campaigns_processed: 0,
        emails_sent: 0,
        errors: 0,
      });
    }

    let totalEmailsSent = 0;
    let totalErrors = 0;
    let campaignsProcessed = 0;

    for (const campaign of campaigns) {
      try {
        // Get coach's Gmail token
        let tokenData;
        try {
          tokenData = await getValidGmailToken(campaign.coach_id, supabaseAdmin);
        } catch (tokenErr) {
          console.error(
            `Campaign ${campaign.id}: Gmail token error — ${tokenErr.message}`
          );
          totalErrors++;
          continue;
        }

        // Get coach info
        const { data: coach } = await supabaseAdmin
          .from("coaches")
          .select("full_name")
          .eq("id", campaign.coach_id)
          .single();

        const coachName = coach?.full_name || "Your Coach";

        // Calculate daily limit based on warmup_day
        const warmupDay = campaign.warmup_day || 1;
        const dailyLimit = getDailyLimit(warmupDay);

        // Count emails already sent today for this campaign
        const todayStart = new Date();
        todayStart.setHours(0, 0, 0, 0);

        const { count: sentToday } = await supabaseAdmin
          .from("reactivation_emails")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("status", "sent")
          .gte("sent_at", todayStart.toISOString());

        const remaining = dailyLimit - (sentToday || 0);
        if (remaining <= 0) {
          campaignsProcessed++;
          continue;
        }

        // Fetch next batch of queued emails
        const batchSize = Math.min(remaining, 15);
        const { data: queuedEmails, error: queueError } = await supabaseAdmin
          .from("reactivation_emails")
          .select("id, client_id")
          .eq("campaign_id", campaign.id)
          .eq("status", "queued")
          .order("created_at", { ascending: true })
          .limit(batchSize);

        if (queueError) {
          console.error(
            `Campaign ${campaign.id}: Queue fetch error — ${queueError.message}`
          );
          totalErrors++;
          campaignsProcessed++;
          continue;
        }

        if (!queuedEmails || queuedEmails.length === 0) {
          // No queued emails left — check if campaign is complete
          const { count: stillQueued } = await supabaseAdmin
            .from("reactivation_emails")
            .select("id", { count: "exact", head: true })
            .eq("campaign_id", campaign.id)
            .eq("status", "queued");

          if ((stillQueued || 0) === 0) {
            await supabaseAdmin
              .from("reactivation_campaigns")
              .update({ status: "completed" })
              .eq("id", campaign.id);
          }
          campaignsProcessed++;
          continue;
        }

        // Send each email in the batch
        let batchSent = 0;
        for (let i = 0; i < queuedEmails.length; i++) {
          const emailRow = queuedEmails[i];

          try {
            // Get client record
            const { data: client } = await supabaseAdmin
              .from("clients")
              .select("full_name, email")
              .eq("id", emailRow.client_id)
              .single();

            if (!client || !client.email) {
              await supabaseAdmin
                .from("reactivation_emails")
                .update({ status: "skipped" })
                .eq("id", emailRow.id);
              continue;
            }

            const firstName = (client.full_name || "").split(" ")[0] || "Friend";
            const subject = renderTemplate(
              campaign.template_subject || "",
              firstName,
              coachName
            );
            const body = renderTemplate(
              campaign.template_body || "",
              firstName,
              coachName
            );

            const siteUrl =
              process.env.NEXT_PUBLIC_SITE_URL || "https://optaviaplus.com";
            const trackingUrl = `${siteUrl}/api/outreach/track/${emailRow.id}`;

            let result;
            try {
              result = await sendGmailEmail({
                accessToken: tokenData.accessToken,
                to: client.email,
                subject,
                body,
                fromName: coachName,
                fromEmail: tokenData.gmailAddress,
                trackingUrl,
              });
            } catch (sendErr) {
              // If auth error, try refreshing token once and retry
              if (
                sendErr.message.includes("401") ||
                sendErr.message.includes("403")
              ) {
                try {
                  tokenData = await getValidGmailToken(
                    campaign.coach_id,
                    supabaseAdmin
                  );
                  result = await sendGmailEmail({
                    accessToken: tokenData.accessToken,
                    to: client.email,
                    subject,
                    body,
                    fromName: coachName,
                    fromEmail: tokenData.gmailAddress,
                    trackingUrl,
                  });
                } catch (retryErr) {
                  console.error(
                    `Campaign ${campaign.id}, email ${emailRow.id}: Retry failed — ${retryErr.message}`
                  );
                  await supabaseAdmin
                    .from("reactivation_emails")
                    .update({ status: "skipped" })
                    .eq("id", emailRow.id);
                  totalErrors++;
                  continue;
                }
              } else {
                console.error(
                  `Campaign ${campaign.id}, email ${emailRow.id}: Send failed — ${sendErr.message}`
                );
                await supabaseAdmin
                  .from("reactivation_emails")
                  .update({ status: "skipped" })
                  .eq("id", emailRow.id);
                totalErrors++;
                continue;
              }
            }

            // Success — update the email row
            const sentAt = new Date().toISOString();
            await supabaseAdmin
              .from("reactivation_emails")
              .update({
                status: "sent",
                gmail_message_id: result.messageId,
                gmail_thread_id: result.threadId,
                sent_at: sentAt,
              })
              .eq("id", emailRow.id);

            // Update last_contact_date on the client
            await supabaseAdmin
              .from("clients")
              .update({ last_contact_date: sentAt })
              .eq("id", emailRow.client_id);

            batchSent++;
            totalEmailsSent++;

            // Random delay between sends (30-90 seconds), skip after last email
            if (i < queuedEmails.length - 1) {
              await randomDelay(30000, 90000);
            }
          } catch (emailErr) {
            console.error(
              `Campaign ${campaign.id}, email ${emailRow.id}: Unexpected error — ${emailErr.message}`
            );
            await supabaseAdmin
              .from("reactivation_emails")
              .update({ status: "skipped" })
              .eq("id", emailRow.id);
            totalErrors++;
          }
        }

        // Update campaign totals
        const newTotalSent = (campaign.total_sent || 0) + batchSent;
        const updateData = { total_sent: newTotalSent };

        // Increment warmup_day if we've completed a full day of sending
        const totalSentToday = (sentToday || 0) + batchSent;
        if (totalSentToday >= dailyLimit) {
          updateData.warmup_day = warmupDay + 1;
        }

        await supabaseAdmin
          .from("reactivation_campaigns")
          .update(updateData)
          .eq("id", campaign.id);

        // Check if all emails are sent
        const { count: remainingQueued } = await supabaseAdmin
          .from("reactivation_emails")
          .select("id", { count: "exact", head: true })
          .eq("campaign_id", campaign.id)
          .eq("status", "queued");

        if ((remainingQueued || 0) === 0) {
          await supabaseAdmin
            .from("reactivation_campaigns")
            .update({ status: "completed" })
            .eq("id", campaign.id);
        }

        campaignsProcessed++;
      } catch (campaignErr) {
        console.error(
          `Campaign ${campaign.id}: Unexpected error — ${campaignErr.message}`
        );
        totalErrors++;
        campaignsProcessed++;
      }
    }

    return NextResponse.json({
      campaigns_processed: campaignsProcessed,
      emails_sent: totalEmailsSent,
      errors: totalErrors,
    });
  } catch (err) {
    console.error("send-batch fatal error:", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "Internal server error" },
      { status: 500 }
    );
  }
}
