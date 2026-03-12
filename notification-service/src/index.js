const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// In-memory schedule store (for demo — in production use a job queue like BullMQ)
const scheduledReminders = new Map();

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'notification-service',
    scheduledCount: scheduledReminders.size,
    timestamp: new Date().toISOString(),
  });
});

// ─── POST /notifications/schedule ─────────────────────────────────────────────
// Body: { userId, title, body, hour, minute }
// Schedule a daily yoga reminder for a user
app.post('/notifications/schedule', async (req, res) => {
  const { userId, title, body, hour, minute } = req.body;

  if (!userId || hour === undefined || minute === undefined) {
    return res.status(400).json({ error: 'userId, hour, and minute are required.' });
  }

  try {
    // Cancel any existing reminder for this user
    if (scheduledReminders.has(userId)) {
      clearTimeout(scheduledReminders.get(userId).timeout);
      scheduledReminders.delete(userId);
    }

    // Calculate delay until next trigger
    const now = new Date();
    let scheduled = new Date(now.getFullYear(), now.getMonth(), now.getDate(), hour, minute, 0);
    if (scheduled <= now) {
      scheduled.setDate(scheduled.getDate() + 1);
    }
    const delayMs = scheduled - now;

    // Store reminder metadata in Supabase
    const { error } = await supabase.from('notification_schedules').upsert({
      user_id: userId,
      title: title ?? 'Time for your yoga session! 🧘',
      body: body ?? 'Stay consistent — your body will thank you.',
      hour,
      minute,
      is_active: true,
      next_trigger: scheduled.toISOString(),
      updated_at: now.toISOString(),
    });

    if (error) throw error;

    // Schedule in-memory timer (fires once, re-schedules daily)
    const scheduleNext = () => {
      const t = setTimeout(async () => {
        console.log(`🔔 Firing reminder for user ${userId}: ${title}`);
        // In production: send FCM/APNs push here
        // For demo: just log and re-schedule
        scheduleNext();
      }, delayMs);
      scheduledReminders.set(userId, { timeout: t, hour, minute, title });
    };
    scheduleNext();

    return res.json({
      success: true,
      userId,
      scheduledFor: `${String(hour).padStart(2, '0')}:${String(minute).padStart(2, '0')}`,
      nextTrigger: scheduled.toISOString(),
      delayMinutes: Math.round(delayMs / 60000),
    });
  } catch (err) {
    console.error('POST /notifications/schedule error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /notifications/cancel/:userId ─────────────────────────────────────
// Cancel scheduled reminder for a user
app.delete('/notifications/cancel/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    if (scheduledReminders.has(userId)) {
      clearTimeout(scheduledReminders.get(userId).timeout);
      scheduledReminders.delete(userId);
    }

    const { error } = await supabase
      .from('notification_schedules')
      .update({ is_active: false, updated_at: new Date().toISOString() })
      .eq('user_id', userId);

    if (error) throw error;

    return res.json({ success: true, userId, message: 'Reminder cancelled.' });
  } catch (err) {
    console.error('DELETE /notifications/cancel error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /notifications/:userId ───────────────────────────────────────────────
// Get scheduled reminder info for a user
app.get('/notifications/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { data, error } = await supabase
      .from('notification_schedules')
      .select('*')
      .eq('user_id', userId)
      .eq('is_active', true)
      .maybeSingle();

    if (error) throw error;

    const inMemory = scheduledReminders.get(userId);

    return res.json({
      userId,
      hasActiveReminder: !!data,
      schedule: data ?? null,
      isLive: !!inMemory,
    });
  } catch (err) {
    console.error('GET /notifications error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /notifications/send ─────────────────────────────────────────────────
// Body: { userId, title, body }
// Immediately send a notification (for testing / instant alerts)
app.post('/notifications/send', async (req, res) => {
  const { userId, title, body } = req.body;

  if (!userId || !title) {
    return res.status(400).json({ error: 'userId and title are required.' });
  }

  try {
    // Log the send event
    const { error } = await supabase.from('notification_logs').insert({
      user_id: userId,
      title,
      body: body ?? '',
      sent_at: new Date().toISOString(),
      type: 'instant',
    });

    if (error) throw error;

    // In production: trigger FCM/APNs push here
    console.log(`📤 Instant notification sent to ${userId}: "${title}"`);

    return res.json({ success: true, userId, title, sentAt: new Date().toISOString() });
  } catch (err) {
    console.error('POST /notifications/send error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3003;
app.listen(PORT, () => {
  console.log(`✅ notification-service running on port ${PORT}`);
});
