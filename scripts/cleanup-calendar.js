#!/usr/bin/env node
/**
 * Cleanup orphaned Google Calendar events for the top-level coach (Alison).
 *
 * The bug created recurring "Check-in:" events whose IDs were wiped from the DB,
 * so we query Google Calendar directly to find and remove them.
 *
 * Usage (from project root):
 *   node scripts/cleanup-calendar.js           # dry run — lists matches, no deletes
 *   node scripts/cleanup-calendar.js --delete  # actually deletes matching events
 *
 * Requires Node 18+ (uses built-in fetch).
 */

require('dotenv').config({ path: '.env.local' });
const { createClient } = require('@supabase/supabase-js');

const DELETE_MODE = process.argv.includes('--delete');

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GOOGLE_CLIENT_ID = process.env.GOOGLE_CLIENT_ID;
const GOOGLE_CLIENT_SECRET = process.env.GOOGLE_CLIENT_SECRET;

// Patterns matching event titles created by buildGoogleEventForCheckin / buildGoogleEventForFollowup
const MATCH_PATTERNS = [
  /^Check-in:/,
  /^Follow-up:/,
];

// ---------------------------------------------------------------------------

async function refreshAccessToken(refreshToken) {
  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      refresh_token: refreshToken,
      client_id: GOOGLE_CLIENT_ID,
      client_secret: GOOGLE_CLIENT_SECRET,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Token refresh failed: ${err}`);
  }
  return res.json();
}

// singleEvents=false returns recurring series as one entry (not expanded instances),
// which is what we want so deleting one ID removes the whole recurring series.
async function listAllEvents(accessToken) {
  const events = [];
  let pageToken = null;

  do {
    const params = new URLSearchParams({ maxResults: '2500', singleEvents: 'false' });
    if (pageToken) params.set('pageToken', pageToken);

    const res = await fetch(
      `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
      { headers: { Authorization: `Bearer ${accessToken}` } }
    );
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`Failed to list events: ${err}`);
    }
    const data = await res.json();
    events.push(...(data.items ?? []));
    pageToken = data.nextPageToken ?? null;
    if (pageToken) process.stdout.write('  (fetching next page...)\n');
  } while (pageToken);

  return events;
}

async function deleteEvent(accessToken, eventId) {
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events/${encodeURIComponent(eventId)}`,
    { method: 'DELETE', headers: { Authorization: `Bearer ${accessToken}` } }
  );
  if (!res.ok && res.status !== 404) {
    const err = await res.text();
    throw new Error(err);
  }
}

// ---------------------------------------------------------------------------

async function main() {
  console.log('\n=== Google Calendar Cleanup Script ===');
  console.log(`Mode: ${DELETE_MODE ? '🔴 DELETE' : '🟡 DRY RUN (pass --delete to actually delete)'}\n`);

  if (!SUPABASE_URL || !SERVICE_ROLE_KEY || !GOOGLE_CLIENT_ID || !GOOGLE_CLIENT_SECRET) {
    console.error('Missing required env vars. Make sure .env.local is present and you are running from the project root.');
    process.exit(1);
  }

  const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

  // --- Find Alison by email ---
  const { data: coach, error: coachErr } = await supabase
    .from('coaches')
    .select('id, full_name, email')
    .eq('email', 'alibfriedman@gmail.com')
    .single();

  if (coachErr || !coach) {
    console.error('Could not find Alison (alibfriedman@gmail.com):', coachErr?.message);
    process.exit(1);
  }
  console.log(`Coach: ${coach.full_name} <${coach.email}>`);
  console.log(`Coach ID: ${coach.id}\n`);

  // --- Get Google Calendar tokens ---
  const { data: conn, error: connErr } = await supabase
    .from('google_calendar_connections')
    .select('access_token, refresh_token, token_expires_at')
    .eq('coach_id', coach.id)
    .single();

  if (connErr || !conn) {
    console.error('No google_calendar_connections row found for this coach.');
    console.error('She may not have Google Calendar connected right now.');
    console.error('If tokens were deleted, you need her to reconnect first so we can get a fresh token.');
    process.exit(1);
  }

  // --- Refresh token if expired or expiring within 60 seconds ---
  let accessToken = conn.access_token;
  const expiresAt = new Date(conn.token_expires_at);
  const isExpired = expiresAt <= new Date(Date.now() + 60_000);

  if (isExpired) {
    console.log('Access token expired or about to expire — refreshing...');
    const tokens = await refreshAccessToken(conn.refresh_token);
    accessToken = tokens.access_token;
    const newExpiry = new Date(Date.now() + tokens.expires_in * 1000).toISOString();
    await supabase
      .from('google_calendar_connections')
      .update({ access_token: accessToken, token_expires_at: newExpiry })
      .eq('coach_id', coach.id);
    console.log(`Token refreshed. New expiry: ${newExpiry}\n`);
  } else {
    console.log(`Token valid until: ${expiresAt.toISOString()}\n`);
  }

  // --- Fetch all calendar events ---
  console.log('Fetching all Google Calendar events...');
  const allEvents = await listAllEvents(accessToken);
  console.log(`Total events on calendar: ${allEvents.length}\n`);

  // --- Filter for app-created recurring events only ---
  // Skip one-time events (e.g. legitimate Follow-up reminders with no recurrence rule)
  const matching = allEvents.filter(event =>
    MATCH_PATTERNS.some(p => p.test(event.summary ?? '')) &&
    event.recurrence?.length > 0
  );

  const checkins  = matching.filter(e => /^Check-in:/.test(e.summary  ?? ''));
  const followups = matching.filter(e => /^Follow-up:/.test(e.summary ?? ''));

  console.log(`Matching events found: ${matching.length}`);
  console.log(`  Check-in:  ${checkins.length}`);
  console.log(`  Follow-up: ${followups.length}`);

  if (matching.length === 0) {
    console.log('\nNo matching events found. Nothing to do.');
    return;
  }

  console.log('\n--- Matching events ---');
  for (const event of matching) {
    const start     = event.start?.dateTime ?? event.start?.date ?? 'unknown date';
    const recurring = event.recurrence?.length ? `🔁 ${event.recurrence[0]}` : '(one-time)';
    console.log(`  [${event.id}]`);
    console.log(`    Title:  "${event.summary}"`);
    console.log(`    Start:  ${start}`);
    console.log(`    Type:   ${recurring}`);
  }

  if (!DELETE_MODE) {
    console.log(`\n✅ Dry run complete. Found ${matching.length} events to clean up.`);
    console.log('   Run with --delete to remove them:');
    console.log('   node scripts/cleanup-calendar.js --delete\n');
    return;
  }

  // --- DELETE ---
  console.log(`\n🔴 Deleting ${matching.length} events...`);
  let deleted = 0;
  let failed  = 0;

  for (const event of matching) {
    try {
      await deleteEvent(accessToken, event.id);
      console.log(`  ✓ Deleted "${event.summary}" [${event.id}]`);
      deleted++;
    } catch (err) {
      console.error(`  ✗ Failed  "${event.summary}" [${event.id}]: ${err.message}`);
      failed++;
    }
  }

  console.log(`\n=== Done: ${deleted} deleted, ${failed} failed ===`);
  if (failed > 0) {
    console.log('   Re-run with --delete to retry the failures (already-deleted events will be skipped via 404).');
  }
  console.log('');
}

main().catch(err => {
  console.error('\nFatal error:', err.message);
  process.exit(1);
});
