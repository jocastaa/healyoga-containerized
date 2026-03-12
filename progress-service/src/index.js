const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const {
  requestLogger, errorHandler, validateUserId,
  validateCompleteSession, validateUnlockLevel,
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

const SESSION_THRESHOLD = 5;

app.get('/health', (req, res) => res.json({
  status: 'ok', service: 'progress-service', timestamp: new Date().toISOString(),
}));

// ─── GET /progress/:userId ────────────────────────────────────────────────────
app.get('/progress/:userId', validateUserId, async (req, res, next) => {
  const { userId } = req.params;
  try {
    let { data, error } = await supabase
      .from('user_progress').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;

    // Auto-create fresh record if missing
    if (!data) {
      const fresh = {
        user_id: userId,
        beginner_sessions: 0, intermediate_sessions: 0, advanced_sessions: 0,
        intermediate_unlocked: false, advanced_unlocked: false,
        current_level: 'Beginner',
      };
      const { error: insertError } = await supabase.from('user_progress').insert(fresh);
      if (insertError) throw insertError;
      data = fresh;
    }
    return res.json(data);
  } catch (err) { next(err); }
});

// ─── POST /progress/:userId/complete ─────────────────────────────────────────
app.post('/progress/:userId/complete', validateUserId, validateCompleteSession, async (req, res, next) => {
  const { userId } = req.params;
  const { level } = req.body;
  try {
    let { data, error } = await supabase
      .from('user_progress').select('*').eq('user_id', userId).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Progress record not found. Call GET /progress/:userId first.' });

    // Ownership check — level must be unlocked
    if (level === 'Intermediate' && !data.intermediate_unlocked)
      return res.status(403).json({ error: 'Intermediate level is not yet unlocked.' });
    if (level === 'Advanced' && !data.advanced_unlocked)
      return res.status(403).json({ error: 'Advanced level is not yet unlocked.' });

    const fieldMap = {
      Beginner: 'beginner_sessions',
      Intermediate: 'intermediate_sessions',
      Advanced: 'advanced_sessions',
    };
    const field = fieldMap[level];
    const newCount = (data[field] || 0) + 1;

    const updates = { [field]: newCount };
    // Auto-unlock next level at threshold
    if (level === 'Beginner' && newCount >= SESSION_THRESHOLD) updates.intermediate_unlocked = true;
    if (level === 'Intermediate' && newCount >= SESSION_THRESHOLD) updates.advanced_unlocked = true;

    const { error: updateError } = await supabase
      .from('user_progress').update(updates).eq('user_id', userId);
    if (updateError) throw updateError;

    // Log to session_completions
    await supabase.from('session_completions').insert({
      user_id: userId, level, completed_at: new Date().toISOString(),
    });

    return res.json({
      success: true, userId, level,
      sessionsCompleted: newCount,
      intermediateUnlocked: updates.intermediate_unlocked ?? data.intermediate_unlocked,
      advancedUnlocked: updates.advanced_unlocked ?? data.advanced_unlocked,
    });
  } catch (err) { next(err); }
});

// ─── POST /progress/:userId/unlock ───────────────────────────────────────────
app.post('/progress/:userId/unlock', validateUserId, validateUnlockLevel, async (req, res, next) => {
  const { userId } = req.params;
  const { level } = req.body;
  try {
    const field = level === 'Intermediate' ? 'intermediate_unlocked' : 'advanced_unlocked';
    const { error } = await supabase
      .from('user_progress').update({ [field]: true }).eq('user_id', userId);
    if (error) throw error;
    return res.json({ success: true, userId, unlockedLevel: level });
  } catch (err) { next(err); }
});

// ─── POST /progress/:userId/reset ────────────────────────────────────────────
app.post('/progress/:userId/reset', validateUserId, async (req, res, next) => {
  const { userId } = req.params;
  try {
    const { error } = await supabase.from('user_progress').update({
      beginner_sessions: 0, intermediate_sessions: 0, advanced_sessions: 0,
      intermediate_unlocked: false, advanced_unlocked: false, current_level: 'Beginner',
    }).eq('user_id', userId);
    if (error) throw error;
    return res.json({ success: true, userId, message: 'Progress reset.' });
  } catch (err) { next(err); }
});

app.use(errorHandler);

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`progress-service running on port ${PORT}`));