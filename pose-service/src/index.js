const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const {
  requestLogger, errorHandler, validateUserId,
  validatePoseActivity, validatePoseComplete, validateSessionLevel,
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
  status: 'ok', service: 'pose-service', timestamp: new Date().toISOString(),
}));

// ─── GET /poses/:userId/:sessionLevel ────────────────────────────────────────
app.get('/poses/:userId/:sessionLevel', validateUserId, validateSessionLevel, async (req, res, next) => {
  const { userId, sessionLevel } = req.params;
  try {
    const { data, error } = await supabase
      .from('pose_progress').select('*')
      .eq('user_id', userId).eq('session_level', sessionLevel);
    if (error) throw error;
    return res.json({ userId, sessionLevel, poses: data, count: data.length });
  } catch (err) { next(err); }
});

// ─── GET /poses/:userId/:sessionLevel/:poseId ─────────────────────────────────
app.get('/poses/:userId/:sessionLevel/:poseId', validateUserId, validateSessionLevel, async (req, res, next) => {
  const { userId, sessionLevel, poseId } = req.params;
  if (!poseId || poseId.trim().length === 0)
    return res.status(400).json({ error: 'poseId is required.' });
  try {
    const { data, error } = await supabase
      .from('pose_progress').select('*')
      .eq('user_id', userId).eq('session_level', sessionLevel).eq('pose_id', poseId).maybeSingle();
    if (error) throw error;
    return res.json({ userId, sessionLevel, poseId, completed: !!data, data: data ?? null });
  } catch (err) { next(err); }
});

// ─── POST /poses/:userId/complete ────────────────────────────────────────────
app.post('/poses/:userId/complete', validateUserId, validatePoseComplete, async (req, res, next) => {
  const { userId } = req.params;
  const { sessionLevel, poseId } = req.body;

  try {
    const { error } = await supabase
      .from('pose_progress')
      .upsert(
        {
          user_id: userId,
          session_level: sessionLevel,
          pose_id: poseId,
          is_completed: true,
          completed_at: new Date().toISOString(),
        },
        {
          onConflict: 'user_id,session_level,pose_id',
        }
      );

    if (error) throw error;

    return res.json({ success: true, userId, sessionLevel, poseId });
  } catch (err) {
    next(err);
  }
});

// ─── POST /poses/:userId/activity ────────────────────────────────────────────
app.post('/poses/:userId/activity', validateUserId, validatePoseActivity, async (req, res, next) => {
  const { userId } = req.params;
  const { poseId, poseName, durationSeconds, sessionLevel } = req.body;
  try {
    const { error } = await supabase.from('pose_activity').insert({
      user_id: userId,
      pose_id: poseId.trim(),
      pose_name: poseName.trim(),
      duration_seconds: Math.round(Number(durationSeconds)),
      session_level: sessionLevel,
      recorded_at: new Date().toISOString(),
    });
    if (error) throw error;
    return res.json({
      success: true, userId, poseId, poseName,
      durationSeconds: Math.round(Number(durationSeconds)), sessionLevel,
    });
  } catch (err) { next(err); }
});

// ─── GET /poses/:userId/activity/summary ─────────────────────────────────────
app.get('/poses/:userId/activity/summary', validateUserId, async (req, res, next) => {
  const { userId } = req.params;
  try {
    const { data, error } = await supabase
      .from('pose_activity').select('pose_id, pose_name, duration_seconds, session_level')
      .eq('user_id', userId);
    if (error) throw error;

    // Aggregate total seconds per pose
    const summary = {};
    for (const row of data) {
      const key = row.pose_id;
      if (!summary[key]) {
        summary[key] = { poseId: row.pose_id, poseName: row.pose_name, sessionLevel: row.session_level, totalSeconds: 0 };
      }
      summary[key].totalSeconds += row.duration_seconds;
    }
    const result = Object.values(summary).map(p => ({
      ...p, totalMinutes: Math.round(p.totalSeconds / 60),
    }));

    return res.json({ userId, poses: result, totalPoses: result.length });
  } catch (err) { next(err); }
});

// ─── DELETE /poses/:userId/reset/:sessionLevel ───────────────────────────────
app.delete('/poses/:userId/reset/:sessionLevel', validateUserId, validateSessionLevel, async (req, res, next) => {
  const { userId, sessionLevel } = req.params;
  try {
    const { error } = await supabase
      .from('pose_progress').delete()
      .eq('user_id', userId).eq('session_level', sessionLevel);
    if (error) throw error;
    return res.json({ success: true, userId, sessionLevel, message: 'Pose progress reset.' });
  } catch (err) { next(err); }
});

app.use(errorHandler);

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`pose-service running on port ${PORT}`));