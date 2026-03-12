const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const { createClient } = require('@supabase/supabase-js');
const {
  requestLogger, errorHandler, validateUserId,
  validateRegister, validateLogin, validateProfileUpdate,
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

function getAgeGroup(age) {
  if (age < 18)  return 'Under 18';
  if (age < 25)  return '18-24';
  if (age < 35)  return '25-34';
  if (age < 45)  return '35-44';
  if (age < 55)  return '45-54';
  if (age < 65)  return '55-64';
  if (age < 75)  return '65-74';
  return '75+';
}

app.get('/health', (req, res) => res.json({
  status: 'ok', service: 'auth-service', timestamp: new Date().toISOString(),
}));

// ─── POST /auth/register ──────────────────────────────────────────────────────
app.post('/auth/register', validateRegister, async (req, res, next) => {
  const { email, password, fullName, age } = req.body;
  try {
    const { data, error } = await supabase.auth.admin.createUser({
      email: email.trim().toLowerCase(),
      password,
      email_confirm: true,
    });
    if (error) {
      if (error.message.includes('already')) return res.status(409).json({ error: 'Email already registered.' });
      throw error;
    }

    const userId = data.user.id;
    await supabase.from('profiles').upsert({
      id: userId,
      full_name: fullName.trim(),
      age: age ? Number(age) : null,
      age_group: age ? getAgeGroup(Number(age)) : null,
      experience_level: 'Beginner',
      preferred_language: 'en',
      push_notifications_enabled: false,
    });

    return res.status(201).json({ success: true, userId, email: data.user.email });
  } catch (err) { next(err); }
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────
app.post('/auth/login', validateLogin, async (req, res, next) => {
  const { email, password } = req.body;
  try {
    const { data, error } = await supabase.auth.signInWithPassword({
      email: email.trim().toLowerCase(), password,
    });
    if (error) return res.status(401).json({ error: 'Invalid email or password.' });
    return res.json({
      success: true,
      userId: data.user.id,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
    });
  } catch (err) { next(err); }
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
app.post('/auth/logout', async (req, res, next) => {
  try {
    await supabase.auth.signOut();
    return res.json({ success: true });
  } catch (err) { next(err); }
});

// ─── POST /auth/reset-password ────────────────────────────────────────────────
app.post('/auth/reset-password', async (req, res, next) => {
  const { email } = req.body;
  if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim()))
    return res.status(400).json({ error: 'A valid email is required.' });
  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email.trim().toLowerCase(), {
      redirectTo: process.env.RESET_PASSWORD_REDIRECT_URL,
    });
    if (error) throw error;
    // Always return success to avoid email enumeration
    return res.json({ success: true, message: 'If that email exists, a reset link has been sent.' });
  } catch (err) { next(err); }
});

// ─── GET /auth/profile/:userId ────────────────────────────────────────────────
app.get('/auth/profile/:userId', validateUserId, async (req, res, next) => {
  try {
    const { data, error } = await supabase
      .from('profiles').select('*').eq('id', req.params.userId).maybeSingle();
    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Profile not found.' });
    return res.json(data);
  } catch (err) { next(err); }
});

// ─── PUT /auth/profile/:userId ────────────────────────────────────────────────
app.put('/auth/profile/:userId', validateUserId, validateProfileUpdate, async (req, res, next) => {
  const { fullName, age, experienceLevel, preferredLanguage, pushNotificationsEnabled } = req.body;
  try {
    const updates = { updated_at: new Date().toISOString() };
    if (fullName !== undefined) updates.full_name = fullName.trim();
    if (age !== undefined) { updates.age = Number(age); updates.age_group = getAgeGroup(Number(age)); }
    if (experienceLevel !== undefined) updates.experience_level = experienceLevel;
    if (preferredLanguage !== undefined) updates.preferred_language = preferredLanguage;
    if (pushNotificationsEnabled !== undefined) updates.push_notifications_enabled = Boolean(pushNotificationsEnabled);

    const { error } = await supabase.from('profiles').update(updates).eq('id', req.params.userId);
    if (error) throw error;
    return res.json({ success: true, userId: req.params.userId, updated: updates });
  } catch (err) { next(err); }
});

app.use(errorHandler);

const PORT = process.env.PORT || 3002;
app.listen(PORT, () => console.log(`auth-service running on port ${PORT}`));