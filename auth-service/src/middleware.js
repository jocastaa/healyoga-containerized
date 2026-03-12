// shared/middleware.js
// Drop this file into each service as src/middleware.js
// Provides: helmet setup, request logger, input validators, error handler

const VALID_LEVELS = ['Beginner', 'Intermediate', 'Advanced'];
const VALID_LANGUAGES = ['en', 'zh'];
const VALID_EXPERIENCE = ['Beginner', 'Intermediate', 'Advanced'];

// ─── Request logger ───────────────────────────────────────────────────────────
function requestLogger(req, res, next) {
  const start = Date.now();
  res.on('finish', () => {
    const ms = Date.now() - start;
    const level = res.statusCode >= 500 ? 'ERROR' :
                  res.statusCode >= 400 ? 'WARN'  : 'INFO';
    console.log(`[${level}] ${req.method} ${req.path} → ${res.statusCode} (${ms}ms)`);
  });
  next();
}

// ─── Shared error handler ─────────────────────────────────────────────────────
function errorHandler(err, req, res, next) {
  console.error(`[ERROR] ${req.method} ${req.path}:`, err.message);
  const status = err.status || err.statusCode || 500;
  res.status(status).json({
    error: err.message || 'Internal server error',
    path: req.path,
    timestamp: new Date().toISOString(),
  });
}

// ─── Validate UUID ────────────────────────────────────────────────────────────
function isValidUUID(str) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(str);
}

// ─── Middleware: validate :userId param is a UUID ─────────────────────────────
function validateUserId(req, res, next) {
  const userId = req.params.userId || req.params.id;
  if (userId && !isValidUUID(userId)) {
    return res.status(400).json({ error: 'Invalid userId format. Must be a valid UUID.' });
  }
  next();
}

// ─── Auth validators ──────────────────────────────────────────────────────────
function validateRegister(req, res, next) {
  const { email, password, fullName, age } = req.body;
  const errors = [];

  if (!email || typeof email !== 'string') errors.push('email is required.');
  else if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim())) errors.push('email is invalid.');

  if (!password || typeof password !== 'string') errors.push('password is required.');
  else if (password.length < 8) errors.push('password must be at least 8 characters.');

  if (!fullName || typeof fullName !== 'string' || fullName.trim().length < 2)
    errors.push('fullName must be at least 2 characters.');

  if (age !== undefined) {
    const ageNum = Number(age);
    if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120)
      errors.push('age must be an integer between 1 and 120.');
  }

  if (errors.length) return res.status(400).json({ errors });
  next();
}

function validateLogin(req, res, next) {
  const { email, password } = req.body;
  const errors = [];
  if (!email || typeof email !== 'string') errors.push('email is required.');
  if (!password || typeof password !== 'string') errors.push('password is required.');
  if (errors.length) return res.status(400).json({ errors });
  next();
}

function validateProfileUpdate(req, res, next) {
  const { age, experienceLevel, preferredLanguage } = req.body;
  const errors = [];

  if (age !== undefined) {
    const ageNum = Number(age);
    if (!Number.isInteger(ageNum) || ageNum < 1 || ageNum > 120)
      errors.push('age must be an integer between 1 and 120.');
  }

  if (experienceLevel !== undefined && !VALID_EXPERIENCE.includes(experienceLevel))
    errors.push(`experienceLevel must be one of: ${VALID_EXPERIENCE.join(', ')}.`);

  if (preferredLanguage !== undefined && !VALID_LANGUAGES.includes(preferredLanguage))
    errors.push(`preferredLanguage must be one of: ${VALID_LANGUAGES.join(', ')}.`);

  if (errors.length) return res.status(400).json({ errors });
  next();
}

// ─── Progress validators ──────────────────────────────────────────────────────
function validateCompleteSession(req, res, next) {
  const { level } = req.body;
  const errors = [];
  if (!level) errors.push('level is required.');
  else if (!VALID_LEVELS.includes(level))
    errors.push(`level must be one of: ${VALID_LEVELS.join(', ')}.`);
  if (errors.length) return res.status(400).json({ errors });
  next();
}

function validateUnlockLevel(req, res, next) {
  const { level } = req.body;
  const errors = [];
  if (!level) errors.push('level is required.');
  else if (!['Intermediate', 'Advanced'].includes(level))
    errors.push('level must be Intermediate or Advanced.');
  if (errors.length) return res.status(400).json({ errors });
  next();
}

// ─── Pose validators ──────────────────────────────────────────────────────────
function validatePoseActivity(req, res, next) {
  const { poseId, poseName, durationSeconds, sessionLevel } = req.body;
  const errors = [];

  if (!poseId || typeof poseId !== 'string' || poseId.trim().length === 0)
    errors.push('poseId is required.');

  if (!poseName || typeof poseName !== 'string' || poseName.trim().length === 0)
    errors.push('poseName is required.');

  if (durationSeconds === undefined || durationSeconds === null)
    errors.push('durationSeconds is required.');
  else {
    const dur = Number(durationSeconds);
    if (isNaN(dur) || dur <= 0)
      errors.push('durationSeconds must be a positive number.');
    else if (dur > 86400)
      errors.push('durationSeconds cannot exceed 86400 (24 hours).');
  }

  if (!sessionLevel) errors.push('sessionLevel is required.');
  else if (!VALID_LEVELS.includes(sessionLevel))
    errors.push(`sessionLevel must be one of: ${VALID_LEVELS.join(', ')}.`);

  if (errors.length) return res.status(400).json({ errors });
  next();
}

function validatePoseComplete(req, res, next) {
  const { sessionLevel, poseId } = req.body;
  const errors = [];
  if (!poseId || typeof poseId !== 'string') errors.push('poseId is required.');
  if (!sessionLevel) errors.push('sessionLevel is required.');
  else if (!VALID_LEVELS.includes(sessionLevel))
    errors.push(`sessionLevel must be one of: ${VALID_LEVELS.join(', ')}.`);
  if (errors.length) return res.status(400).json({ errors });
  next();
}

function validateSessionLevel(req, res, next) {
  const { sessionLevel } = req.params;
  if (sessionLevel && !VALID_LEVELS.includes(sessionLevel)) {
    return res.status(400).json({
      error: `sessionLevel must be one of: ${VALID_LEVELS.join(', ')}.`
    });
  }
  next();
}

// ─── Notification validators ──────────────────────────────────────────────────
function validateSchedule(req, res, next) {
  const { userId, hour, minute } = req.body;
  const errors = [];

  if (!userId) errors.push('userId is required.');
  else if (!isValidUUID(userId)) errors.push('userId must be a valid UUID.');

  if (hour === undefined || hour === null) errors.push('hour is required.');
  else {
    const h = Number(hour);
    if (!Number.isInteger(h) || h < 0 || h > 23)
      errors.push('hour must be an integer between 0 and 23.');
  }

  if (minute === undefined || minute === null) errors.push('minute is required.');
  else {
    const m = Number(minute);
    if (!Number.isInteger(m) || m < 0 || m > 59)
      errors.push('minute must be an integer between 0 and 59.');
  }

  if (errors.length) return res.status(400).json({ errors });
  next();
}

function validateSend(req, res, next) {
  const { userId, title } = req.body;
  const errors = [];
  if (!userId) errors.push('userId is required.');
  else if (!isValidUUID(userId)) errors.push('userId must be a valid UUID.');
  if (!title || typeof title !== 'string' || title.trim().length === 0)
    errors.push('title is required.');
  else if (title.length > 200) errors.push('title must not exceed 200 characters.');
  if (errors.length) return res.status(400).json({ errors });
  next();
}

module.exports = {
  requestLogger,
  errorHandler,
  validateUserId,
  validateRegister,
  validateLogin,
  validateProfileUpdate,
  validateCompleteSession,
  validateUnlockLevel,
  validatePoseActivity,
  validatePoseComplete,
  validateSessionLevel,
  validateSchedule,
  validateSend,
  VALID_LEVELS,
};
