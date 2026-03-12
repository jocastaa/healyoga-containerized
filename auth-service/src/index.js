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
  res.json({ status: 'ok', service: 'auth-service', timestamp: new Date().toISOString() });
});

// ─── POST /auth/register ──────────────────────────────────────────────────────
// Body: { email, password, fullName, age }
app.post('/auth/register', async (req, res) => {
  const { email, password, fullName, age } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required.' });
  }

  try {
    // Create auth user via Supabase Admin API
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: false,
      user_metadata: { full_name: fullName },
    });

    if (authError) throw authError;

    const userId = authData.user.id;

    // Determine age group
    const ageGroup = getAgeGroup(age);

    // Upsert profile
    const { error: profileError } = await supabase.from('profiles').upsert({
      id: userId,
      email,
      full_name: fullName ?? '',
      age: age ?? null,
      age_group: ageGroup,
      experience_level: 'Beginner',
      preferred_language: 'English',
      push_notifications_enabled: true,
    });

    if (profileError) throw profileError;

    return res.status(201).json({
      success: true,
      userId,
      email,
      message: 'User registered. Please verify your email.',
    });
  } catch (err) {
    console.error('POST /auth/register error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /auth/login ─────────────────────────────────────────────────────────
// Body: { email, password }
// Returns session tokens
app.post('/auth/login', async (req, res) => {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(400).json({ error: 'email and password are required.' });
  }

  try {
    const { data, error } = await supabase.auth.signInWithPassword({ email, password });

    if (error) throw error;

    return res.json({
      success: true,
      accessToken: data.session.access_token,
      refreshToken: data.session.refresh_token,
      expiresAt: data.session.expires_at,
      user: {
        id: data.user.id,
        email: data.user.email,
      },
    });
  } catch (err) {
    console.error('POST /auth/login error:', err.message);
    return res.status(401).json({ error: 'Invalid credentials.' });
  }
});

// ─── POST /auth/logout ────────────────────────────────────────────────────────
// Body: { accessToken }
app.post('/auth/logout', async (req, res) => {
  try {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    return res.json({ success: true, message: 'Logged out.' });
  } catch (err) {
    console.error('POST /auth/logout error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── POST /auth/reset-password ────────────────────────────────────────────────
// Body: { email }
// Sends a password reset email
app.post('/auth/reset-password', async (req, res) => {
  const { email } = req.body;

  if (!email) {
    return res.status(400).json({ error: 'email is required.' });
  }

  try {
    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: process.env.RESET_PASSWORD_REDIRECT_URL ?? 'https://healyoga-web.web.app/reset-password',
    });

    if (error) throw error;

    return res.json({ success: true, message: 'Password reset email sent.' });
  } catch (err) {
    console.error('POST /auth/reset-password error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── GET /auth/profile/:userId ────────────────────────────────────────────────
// Returns profile data for a user
app.get('/auth/profile/:userId', async (req, res) => {
  const { userId } = req.params;

  try {
    const { data, error } = await supabase
      .from('profiles')
      .select('*')
      .eq('id', userId)
      .maybeSingle();

    if (error) throw error;
    if (!data) return res.status(404).json({ error: 'Profile not found.' });

    return res.json(data);
  } catch (err) {
    console.error('GET /auth/profile error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── PUT /auth/profile/:userId ────────────────────────────────────────────────
// Body: { fullName, age, experienceLevel, preferredLanguage, pushNotificationsEnabled }
app.put('/auth/profile/:userId', async (req, res) => {
  const { userId } = req.params;
  const { fullName, age, experienceLevel, preferredLanguage, pushNotificationsEnabled } = req.body;

  try {
    const updates = {
      id: userId,
      ...(fullName !== undefined && { full_name: fullName }),
      ...(age !== undefined && { age, age_group: getAgeGroup(age) }),
      ...(experienceLevel !== undefined && { experience_level: experienceLevel }),
      ...(preferredLanguage !== undefined && { preferred_language: preferredLanguage }),
      ...(pushNotificationsEnabled !== undefined && { push_notifications_enabled: pushNotificationsEnabled }),
    };

    const { error } = await supabase.from('profiles').upsert(updates);
    if (error) throw error;

    return res.json({ success: true, userId, updates });
  } catch (err) {
    console.error('PUT /auth/profile error:', err.message);
    return res.status(500).json({ error: err.message });
  }
});

// ─── Helper ───────────────────────────────────────────────────────────────────
function getAgeGroup(age) {
  if (!age) return 'Unknown';
  if (age < 18)       return 'Under 18';
  if (age <= 24)      return '18-24 years';
  if (age <= 34)      return '25-34 years';
  if (age <= 44)      return '35-44 years';
  if (age <= 54)      return '45-54 years';
  if (age <= 64)      return '55-64 years';
  if (age <= 74)      return '65-74 years';
  return '75+ years';
}

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 3002;
app.listen(PORT, () => {
  console.log(`✅ auth-service running on port ${PORT}`);
});
