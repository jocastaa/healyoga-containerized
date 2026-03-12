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

app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'notification-service', stateless: true, timestamp: new Date().toISOString() });
});

// ─── POST /notifications/schedule ─────────────────────────────────────────────
// Body: { userId, hour, minute } — writes to profiles table
app.post('/notifications/schedule', async (req, res) => {
  const { userId, hour, minute } = req.body;
  if (!userId || hour === undefined || minute === undefined) {
    return res.status(400).json({ error: 'userId, hour, and minute are required.' });
  }

  try {
    const period = hour >= 12 ? 'PM' : 'AM';
    const displayHour = hour % 12 === 0 ? 12 : hour % 12;
    const reminderTime = `${displayHour}:${String(minute).padStart(2, '0')} ${period}`;

    const { error } = await supabase
      .from('profiles')
      .update({
        daily_practice_reminder: true,
        reminder_time: reminderTime,
      })
      .eq('id', userId);

    if (error) throw error;

    return res.json({ success: true, userId, reminderTime, note: 'Worker will fire daily at this time.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /notifications/cancel/:userId ─────────────────────────────────────
app.delete('/notifications/cancel/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { error } = await supabase
      .from('profiles')
      .update({ daily_practice_reminder: false })
      .eq('id', userId);
    if (error) throw error;
    return res.json({ success: true, userId, message: 'Reminder disabled.' });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /notifications/:userId ───────────────────────────────────────────────
app.get('/notifications/:userId', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('daily_practice_reminder, reminder_time')
      .eq('id', userId)
      .maybeSingle();
    if (error) throw error;
    return res.json({
      userId,
      hasActiveReminder: data?.daily_practice_reminder ?? false,
      reminderTime: data?.reminder_time ?? null,
    });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /notifications/send ─────────────────────────────────────────────────
app.post('/notifications/send', async (req, res) => {
  const { userId, title, body } = req.body;
  if (!userId || !title) return res.status(400).json({ error: 'userId and title are required.' });
  try {
    const { error } = await supabase.from('notification_logs').insert({
      user_id: userId, title, body: body ?? '',
      sent_at: new Date().toISOString(), type: 'instant', fired_by: 'api',
    });
    if (error) throw error;
    return res.json({ success: true, userId, title, sentAt: new Date().toISOString() });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /notifications/:userId/logs ──────────────────────────────────────────
app.get('/notifications/:userId/logs', async (req, res) => {
  const { userId } = req.params;
  try {
    const { data, error } = await supabase
      .from('notification_logs').select('*').eq('user_id', userId)
      .order('sent_at', { ascending: false }).limit(20);
    if (error) throw error;
    return res.json({ userId, logs: data, count: data.length });
  } catch (err) {
    return res.status(500).json({ error: err.message });
  }
});

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log('✅ notification-service (stateless) running on port ' + PORT));
