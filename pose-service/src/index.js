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

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', service: 'pose-service', timestamp: new Date().toISOString() });
});

// ─── GET /poses/:userId/:sessionLevel ─────────────────────────────────────────
// Returns all completed poses for a user at a given session level
app.get('/poses/:userId/:sessionLevel', async (req, res) => {
  const { userId, sessionLevel } = req.params;

  try {
    const { data, error } = await supabase
      .from('pose_progress')
      .select('pose_id, is_completed, completed_at')
      .eq('user_id', userId)
      .eq('session_level', sessionLevel)
      .eq('is_completed', true);

    if (error) throw error;

    return res.json({
      userId,
      sessionLevel,
      completedPoses: data.map(row => row.pose_id),
      count: data.length,
    });
  } catch (err) {
    console.error('GET /poses error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /poses/:userId/:sessionLevel/:poseId ─────────────────────────────────
// Check if a specific pose is completed
app.get('/poses/:userId/:sessionLevel/:poseId', async (req, res) => {
  const { userId, sessionLevel, poseId } = req.params;

  try {
    const { data, error } = await supabase
      .from('pose_progress')
      .select('is_completed')
      .eq('user_id', userId)
      .eq('session_level', sessionLevel)
      .eq('pose_id', poseId)
      .maybeSingle();

    if (error) throw error;

    return res.json({
      userId,
      sessionLevel,
      poseId,
      isCompleted: data?.is_completed ?? false,
    });
  } catch (err) {
    console.error('GET /poses/:poseId error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /poses/:userId/complete ─────────────────────────────────────────────
// Body: { sessionLevel, poseId }
// Mark a pose as completed
app.post('/poses/:userId/complete', async (req, res) => {
  const { userId } = req.params;
  const { sessionLevel, poseId } = req.body;

  if (!sessionLevel || !poseId) {
    return res.status(400).json({ error: 'sessionLevel and poseId are required.' });
  }

  try {
    const { error } = await supabase.from('pose_progress').upsert({
      user_id: userId,
      session_level: sessionLevel,
      pose_id: poseId,
      is_completed: true,
      completed_at: new Date().toISOString(),
    });

    if (error) throw error;

    return res.json({ success: true, userId, sessionLevel, poseId });
  } catch (err) {
    console.error('POST /poses/complete error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /poses/:userId/activity ─────────────────────────────────────────────
// Body: { poseId, poseName, durationSeconds, sessionLevel }
// Log time spent on a pose (maps to pose_activity table)
app.post('/poses/:userId/activity', async (req, res) => {
  const { userId } = req.params;
  const { poseId, poseName, durationSeconds, sessionLevel } = req.body;

  if (!poseId || !durationSeconds) {
    return res.status(400).json({ error: 'poseId and durationSeconds are required.' });
  }

  try {
    const { error } = await supabase.from('pose_activity').insert({
      user_id: userId,
      pose_id: poseId,
      pose_name: poseName ?? poseId,
      duration_seconds: durationSeconds,
      session_level: sessionLevel ?? 'Beginner',
      logged_at: new Date().toISOString(),
    });

    if (error) throw error;

    return res.json({ success: true, userId, poseId, durationSeconds });
  } catch (err) {
    console.error('POST /poses/activity error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /poses/:userId/activity/summary ──────────────────────────────────────
// Returns total time spent per pose for a user
app.get('/poses/:userId/activity/summary', async (req, res) => {
  const { userId } = req.params;

  try {
    const { data, error } = await supabase
      .from('pose_activity')
      .select('pose_id, pose_name, duration_seconds, session_level')
      .eq('user_id', userId);

    if (error) throw error;

    // Aggregate total seconds per pose
    const summary = {};
    for (const row of data) {
      if (!summary[row.pose_id]) {
        summary[row.pose_id] = {
          poseId: row.pose_id,
          poseName: row.pose_name,
          sessionLevel: row.session_level,
          totalSeconds: 0,
          totalMinutes: 0,
        };
      }
      summary[row.pose_id].totalSeconds += row.duration_seconds;
    }

    // Convert to minutes
    for (const key of Object.keys(summary)) {
      summary[key].totalMinutes = Math.round(summary[key].totalSeconds / 60);
    }

    return res.json({
      userId,
      poses: Object.values(summary),
    });
  } catch (err) {
    console.error('GET /poses/activity/summary error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── DELETE /poses/:userId/reset/:sessionLevel ────────────────────────────────
// Reset all pose progress for a user at a given level (admin/testing)
app.delete('/poses/:userId/reset/:sessionLevel', async (req, res) => {
  const { userId, sessionLevel } = req.params;

  try {
    const { error } = await supabase
      .from('pose_progress')
      .delete()
      .eq('user_id', userId)
      .eq('session_level', sessionLevel);

    if (error) throw error;

    return res.json({ success: true, userId, sessionLevel, message: 'Pose progress reset.' });
  } catch (err) {
    console.error('DELETE /poses/reset error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3001;
app.listen(PORT, () => {
  console.log(`✅ pose-service running on port ${PORT}`);
});
