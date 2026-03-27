const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

/**
 * Send an email via Gmail API using a raw RFC 2822 message.
 */
export async function sendGmailEmail({
  accessToken,
  to,
  subject,
  body,
  fromName,
  fromEmail,
}) {
  // Build RFC 2822 message
  const messageParts = [
    `From: "${fromName}" <${fromEmail}>`,
    `To: ${to}`,
    `Subject: ${subject}`,
    `MIME-Version: 1.0`,
    `Content-Type: text/plain; charset="UTF-8"`,
    ``,
    body,
  ];
  const rawMessage = messageParts.join("\r\n");

  // Base64url encode
  const encoded = Buffer.from(rawMessage)
    .toString("base64")
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");

  const res = await fetch(
    "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ raw: encoded }),
    }
  );

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail send failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return { messageId: data.id, threadId: data.threadId };
}

/**
 * Refresh an expired Gmail access token.
 */
export async function refreshGmailToken(refreshToken) {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: "refresh_token",
    }),
  });

  if (!res.ok) {
    const errText = await res.text();
    throw new Error(`Gmail token refresh failed (${res.status}): ${errText}`);
  }

  const data = await res.json();
  return { access_token: data.access_token, expires_in: data.expires_in };
}

/**
 * Get a valid (non-expired) Gmail access token for a coach.
 * Refreshes automatically if expiring within 5 minutes.
 */
export async function getValidGmailToken(coachId, supabase) {
  const { data, error } = await supabase
    .from("gmail_tokens")
    .select("access_token, refresh_token, token_expiry, gmail_address")
    .eq("coach_id", coachId)
    .single();

  if (error || !data) {
    throw new Error("Gmail not connected");
  }

  const expiresAt = new Date(data.token_expiry).getTime();
  const fiveMinutes = 5 * 60 * 1000;

  // If token expires within 5 minutes, refresh it
  if (Date.now() + fiveMinutes >= expiresAt) {
    const refreshed = await refreshGmailToken(data.refresh_token);
    const newExpiry = new Date(
      Date.now() + refreshed.expires_in * 1000
    ).toISOString();

    await supabase
      .from("gmail_tokens")
      .update({
        access_token: refreshed.access_token,
        token_expiry: newExpiry,
      })
      .eq("coach_id", coachId);

    return {
      accessToken: refreshed.access_token,
      gmailAddress: data.gmail_address,
    };
  }

  return {
    accessToken: data.access_token,
    gmailAddress: data.gmail_address,
  };
}
