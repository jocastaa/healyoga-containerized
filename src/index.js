const express = require('express');
const cors = require('cors');
const { createClient } = require('@supabase/supabase-js');

const app = express();
app.use(cors());
app.use(express.json());

// Supabase client (injected via env)
const supabase = createClient(
  process.env.SUPABASE_URL,
  process.env.SUPABASE_SERVICE_KEY
);

// ─── Constants ────────────────────────────────────────────────────────────────
const SESSIONS_FOR_INTERMEDIATE = 5;
const SESSIONS_FOR_ADVANCED = 5;

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'progress-service', timestamp: new Date().toISOString() });
});

// ─── GET /progress/:userId ─────────────────────────────────────────────────────
// Returns full UserProgress for a user
app.get('/progress/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { data, error } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;

    if (!data) {
      // Auto-create a fresh progress record
      const fresh = buildFreshProgress(userId);
      const { error: insertError } = await supabase
        .from('user_progress')
        .insert(fresh);
      if (insertError) throw insertError;
      return res.json(fresh);
    }

    return res.json(data);
  } catch (err) {
    console.error('GET /progress error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /progress/:userId/complete ──────────────────────────────────────────
// Body: { level: 'Beginner' | 'Intermediate' | 'Advanced' }
// Increments session count, unlocks next level if threshold reached
app.post('/progress/:userId/complete', async (req, res) => {
  const { userId } = req.params;
  const { level } = req.body;

  if (!['Beginner', 'Intermediate', 'Advanced'].includes(level)) {
    return res.status(400).json({ error: 'Invalid level. Must be Beginner, Intermediate, or Advanced.' });
  }

  try {
    // Fetch current progress (or create fresh)
    let { data: progress, error } = await supabase
      .from('user_progress')
      .select('*')
      .eq('user_id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!progress) {
      progress = buildFreshProgress(userId);
    }

    // Increment the right counter
    if (level === 'Beginner')      progress.beginner_sessions_completed += 1;
    if (level === 'Intermediate')  progress.intermediate_sessions_completed += 1;
    if (level === 'Advanced')      progress.advanced_sessions_completed += 1;
    progress.total_sessions_completed += 1;

    // Unlock next level if threshold reached
    if (!progress.intermediate_unlocked &&
        progress.beginner_sessions_completed >= SESSIONS_FOR_INTERMEDIATE) {
      progress.intermediate_unlocked = true;
    }
    if (!progress.advanced_unlocked &&
        progress.intermediate_unlocked &&
        progress.intermediate_sessions_completed >= SESSIONS_FOR_ADVANCED) {
      progress.advanced_unlocked = true;
    }

    progress.last_updated = new Date().toISOString();

    const { error: upsertError } = await supabase
      .from('user_progress')
      .upsert(progress);
    if (upsertError) throw upsertError;

    return res.json({ success: true, progress });
  } catch (err) {
    console.error('POST /progress/complete error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /progress/:userId/reset ─────────────────────────────────────────────
// Resets all progress for a user (testing / admin use)
app.post('/progress/:userId/reset', async (req, res) => {
  const { userId } = req.params;

  try {
    const fresh = buildFreshProgress(userId);
    const { error } = await supabase
      .from('user_progress')
      .upsert(fresh);
    if (error) throw error;

    return res.json({ success: true, progress: fresh });
  } catch (err) {
    console.error('POST /progress/reset error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /progress/:userId/unlock ────────────────────────────────────────────
// Body: { level: 'Intermediate' | 'Advanced' }
// Admin/testing: force-unlock a level
app.post('/progress/:userId/unlock', async (req, res) => {
  const { userId } = req.params;
  const { level } = req.body;

  if (!['Intermediate', 'Advanced'].includes(level)) {
    return res.status(400).json({ error: 'Can only unlock Intermediate or Advanced.' });
  }

  try {
    const update = {
      user_id: userId,
      last_updated: new Date().toISOString(),
      ...(level === 'Intermediate' ? { intermediate_unlocked: true } : { advanced_unlocked: true }),
    };

    const { error } = await supabase
      .from('user_progress')
      .upsert(update);
    if (error) throw error;

    return res.json({ success: true, unlockedLevel: level });
  } catch (err) {
    console.error('POST /progress/unlock error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Helper ───────────────────────────────────────────────────────────────────
function buildFreshProgress(userId) {
  return {
    user_id: userId,
    current_level: 'Beginner',
    beginner_unlocked: true,
    intermediate_unlocked: false,
    advanced_unlocked: false,
    beginner_sessions_completed: 0,
    intermediate_sessions_completed: 0,
    advanced_sessions_completed: 0,
    total_sessions_completed: 0,
    last_updated: new Date().toISOString(),
  };
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`✅ progress-service running on port ${PORT}`);
});
