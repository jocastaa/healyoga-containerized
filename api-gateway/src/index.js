const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Service URLs ─────────────────────────────────────────────────────────────
const SERVICES = {
  auth:         process.env.AUTH_SERVICE_URL         || 'http://auth-service:3002',
  progress:     process.env.PROGRESS_SERVICE_URL     || 'http://progress-service:3000',
  pose:         process.env.POSE_SERVICE_URL         || 'http://pose-service:3001',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3003',
};

console.log('🌐 API Gateway booting...');
console.log('   /auth/*          →', SERVICES.auth);
console.log('   /progress/*      →', SERVICES.progress);
console.log('   /poses/*         →', SERVICES.pose);
console.log('   /notifications/* →', SERVICES.notification);

// ─── Gateway health ───────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    routes: {
      '/auth/*':          SERVICES.auth,
      '/progress/*':      SERVICES.progress,
      '/poses/*':         SERVICES.pose,
      '/notifications/*': SERVICES.notification,
    },
  });
});

// ─── Status — pings all downstream services ───────────────────────────────────
app.get('/status', async (req, res) => {
  const https = require('https');
  const http  = require('http');

  const ping = (url) => new Promise((resolve) => {
    const start = Date.now();
    const client = url.startsWith('https') ? https : http;
    const req = client.get(`${url}/health`, { timeout: 5000, rejectUnauthorized: false }, (r) => {
      let data = '';
      r.on('data', chunk => data += chunk);
      r.on('end', () => {
        try { resolve({ status: 'ok', latencyMs: Date.now() - start, response: JSON.parse(data) }); }
        catch { resolve({ status: 'ok', latencyMs: Date.now() - start }); }
      });
    });
    req.on('error', (e) => resolve({ status: 'unreachable', error: e.message }));
    req.on('timeout', () => { req.destroy(); resolve({ status: 'timeout' }); });
  });

  const [auth, progress, pose, notification] = await Promise.all([
    ping(SERVICES.auth),
    ping(SERVICES.progress),
    ping(SERVICES.pose),
    ping(SERVICES.notification),
  ]);

  const allHealthy = [auth, progress, pose, notification].every(s => s.status === 'ok');

  res.status(allHealthy ? 200 : 207).json({
    gateway: 'ok',
    timestamp: new Date().toISOString(),
    services: {
      'auth-service':         { url: SERVICES.auth,         ...auth },
      'progress-service':     { url: SERVICES.progress,     ...progress },
      'pose-service':         { url: SERVICES.pose,         ...pose },
      'notification-service': { url: SERVICES.notification, ...notification },
    },
  });
});

// ─── Proxy config ─────────────────────────────────────────────────────────────
// No pathRewrite — gateway forwards the full original path as-is.
// POST /auth/login → auth service receives POST /auth/login ✅
const proxy = (target) => createProxyMiddleware({
  target,
  changeOrigin: true,
  secure: false,
  proxyTimeout: 60000,
  timeout: 60000,
  agent: target.startsWith('https')
      ? new https.Agent({ rejectUnauthorized: false, keepAlive: true })
      : undefined,
  on: {
    error: (err, req, res) => {
      console.error(`[Gateway] Proxy error → ${target}: ${err.code} – ${err.message}`);
      res.status(502).json({ error: 'Service unavailable', downstream: target, reason: err.code });
    },
  },
});

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth',          proxy(SERVICES.auth));
app.use('/progress',      proxy(SERVICES.progress));
app.use('/poses',         proxy(SERVICES.pose));
app.use('/notifications', proxy(SERVICES.notification));

// ─── 404 ──────────────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    gateway: 'healy-api-gateway',
    availableRoutes: [
      'GET  /health',
      'GET  /status',
      'ANY  /auth/**',
      'ANY  /progress/**',
      'ANY  /poses/**',
      'ANY  /notifications/**',
    ],
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => console.log(`✅ api-gateway running on port ${PORT}`));