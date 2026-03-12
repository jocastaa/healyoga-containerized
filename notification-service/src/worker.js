const { createClient } = require('@supabase/supabase-js');

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

const POLL_INTERVAL_MS = parseInt(process.env.POLL_INTERVAL_MS) || 30000;

console.log('✅ notification-worker started');
console.log(`   Polling every ${POLL_INTERVAL_MS / 1000}s`);
console.log(`   Source: profiles.daily_practice_reminder + profiles.reminder_time`);

// ─── Parse "9:00 AM" / "1:47 PM" → { hour, minute } ─────────────────────────
function parseReminderTime(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = parseInt(match[1]);
  const minute = parseInt(match[2]);
  const period = match[3].toUpperCase();

  if (period === 'AM' && hour === 12) hour = 0;
  if (period === 'PM' && hour !== 12) hour += 12;

  return { hour, minute };
}

// ─── Main worker loop ─────────────────────────────────────────────────────────
async function processDueReminders() {
  const now = new Date();
  console.log(`[${now.toISOString()}] 🔍 Checking profiles for due reminders...`);

  try {
    // Get all users with reminders enabled
    const { data: profiles, error } = await supabase
      .from('profiles')
      .select('id, reminder_time')
      .eq('daily_practice_reminder', true)
      .not('reminder_time', 'is', null);

    if (error) throw error;
    if (!profiles || profiles.length === 0) {
      console.log('   No active reminders found.');
      return;
    }

    console.log(`   Found ${profiles.length} user(s) with reminders enabled.`);

    const nowHour = now.getUTCHours();
    const nowMinute = now.getUTCMinutes();

    for (const profile of profiles) {
      const parsed = parseReminderTime(profile.reminder_time);
      if (!parsed) {
        console.warn(`   ⚠️  Could not parse reminder_time "${profile.reminder_time}" for user ${profile.id}`);
        continue;
      }

      // Check if within a 1-minute window of the scheduled time
      const minutesSinceMidnight = parsed.hour * 60 + parsed.minute;
      const nowMinutesSinceMidnight = nowHour * 60 + nowMinute;
      const diff = Math.abs(minutesSinceMidnight - nowMinutesSinceMidnight);

      if (diff <= 1) {
        await fireReminder(profile, now);
      }
    }
  } catch (err) {
    console.error('Worker error:', err.message);
  }
}

// ─── Fire a single reminder ───────────────────────────────────────────────────
async function fireReminder(profile, now) {
  try {
    // Check if we already fired this reminder in the last 5 minutes (dedup)
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const { data: recentLog } = await supabase
      .from('notification_logs')
      .select('id')
      .eq('user_id', profile.id)
      .eq('type', 'scheduled')
      .gte('sent_at', fiveMinutesAgo)
      .maybeSingle();

    if (recentLog) {
      console.log(`   ⏭️  Skipping ${profile.id} — already fired recently.`);
      return;
    }

    console.log(`   🔔 Firing reminder for user ${profile.id} (${profile.reminder_time})`);

    const { error } = await supabase.from('notification_logs').insert({
      user_id: profile.id,
      title: 'Time for your yoga session! 🧘',
      body: 'Stay consistent — your body will thank you.',
      sent_at: now.toISOString(),
      type: 'scheduled',
      fired_by: 'worker',
    });

    if (error) throw error;

    console.log(`   ✅ Logged notification for ${profile.id}`);

    // In production: send FCM/APNs push here
    // await sendFCMPush(profile.id, title, body);

  } catch (err) {
    console.error(`   ❌ Failed to fire reminder for ${profile.id}:`, err.message);
  }
}

// ─── Health endpoint ──────────────────────────────────────────────────────────
const http = require('http');
const HEALTH_PORT = process.env.HEALTH_PORT || 3004;
http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({
      status: 'ok',
      service: 'notification-worker',
      pollIntervalMs: POLL_INTERVAL_MS,
      timestamp: new Date().toISOString(),
    }));
  } else {
    res.writeHead(404); res.end();
  }
}).listen(HEALTH_PORT, () => console.log(`   Health check on port ${HEALTH_PORT}`));

// ─── Start ────────────────────────────────────────────────────────────────────
processDueReminders();
setInterval(processDueReminders, POLL_INTERVAL_MS);
