const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const {
  requestLogger, errorHandler, validateUserId,
  validateSchedule, validateSend,
} = require('./middleware');

const app = express();
app.use(helmet());
app.use(cors());
app.use(express.json());
app.use(requestLogger);

const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

app.get('/health', (req, res) => res.json({
  status: 'ok', service: 'notification-service', stateless: true, timestamp: new Date().toISOString(),
}));

// ─── POST /notifications/schedule ────────────────────────────────────────────
app.post('/notifications/schedule', validateSchedule, async (req, res, next) => {
  const { userId, hour, minute } = req.body;
  try {
    const h = Number(hour), m = Number(minute);
    const period = h >= 12 ? 'PM' : 'AM';
    const displayHour = h % 12 === 0 ? 12 : h % 12;
    const reminderTime = `${displayHour}:${String(m).padStart(2, '0')} ${period}`;

    const { error } = await supabase
      .from('profiles')
      .update({ daily_practice_reminder: true, reminder_time: reminderTime })
      .eq('id', userId);
    if (error) throw error;

    return res.json({ success: true, userId, reminderTime,
      note: 'Worker polls Supabase and fires notification at scheduled time.' });
  } catch (err) { next(err); }
});

// ─── DELETE /notifications/cancel/:userId ────────────────────────────────────
app.delete('/notifications/cancel/:userId', validateUserId, async (req, res, next) => {
  try {
    const { error } = await supabase
      .from('profiles').update({ daily_practice_reminder: false }).eq('id', req.params.userId);
    if (error) throw error;
    return res.json({ success: true, userId: req.params.userId, message: 'Reminder disabled.' });
  } catch (err) { next(err); }
});

// ─── GET /notifications/:userId ───────────────────────────────────────────────
app.get('/notifications/:userId', validateUserId, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('profiles').select('daily_practice_reminder, reminder_time')
      .eq('id', req.params.userId).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'User not found.' });
    return res.json({
      userId: req.params.userId,
      hasActiveReminder: data.daily_practice_reminder ?? false,
      reminderTime: data.reminder_time ?? null,
    });
  } catch (err) { next(err); }
});

// ─── POST /notifications/send ─────────────────────────────────────────────────
app.post('/notifications/send', validateSend, async (req, res, next) => {
  const { userId, title, body } = req.body;
  try {
    const { error } = await supabase.from('notification_logs').insert({
      user_id: userId, title: title.trim(), body: body?.trim() ?? '',
      sent_at: new Date().toISOString(), type: 'instant', fired_by: 'api',
    });
    if (error) throw error;
    return res.json({ success: true, userId, title, sentAt: new Date().toISOString() });
  } catch (err) { next(err); }
});

// ─── GET /notifications/:userId/logs ──────────────────────────────────────────
app.get('/notifications/:userId/logs', validateUserId, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('notification_logs').select('*').eq('user_id', req.params.userId)
      .order('sent_at', { ascending: false }).limit(20);
    if (error) throw error;
    return res.json({ userId: req.params.userId, logs: data, count: data.length });
  } catch (err) { next(err); }
});

app.use(errorHandler);

const PORT = process.env.PORT || 3003;
app.listen(PORT, () => console.log(`notification-service (stateless) running on port ${PORT}`));