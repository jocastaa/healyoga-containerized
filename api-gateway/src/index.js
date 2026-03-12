const express = require('express');
const cors = require('cors');
const { createProxyMiddleware } = require('http-proxy-middleware');

const app = express();
app.use(cors());
app.use(express.json());

// ─── Service URLs (env vars → Render URLs in production, localhost in dev) ────
const SERVICES = {
  auth:         process.env.AUTH_SERVICE_URL         || 'http://auth-service:3002',
  progress:     process.env.PROGRESS_SERVICE_URL     || 'http://progress-service:3000',
  pose:         process.env.POSE_SERVICE_URL         || 'http://pose-service:3001',
  notification: process.env.NOTIFICATION_SERVICE_URL || 'http://notification-service:3003',
};

console.log('🌐 API Gateway booting with services:', SERVICES);

// ─── Health check ─────────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    service: 'api-gateway',
    timestamp: new Date().toISOString(),
    services: SERVICES,
  });
});

// ─── Service status (pings all downstream services) ───────────────────────────
app.get('/status', async (req, res) => {
  const https = require('https');
  const http  = require('http');

  const ping = (url) => new Promise((resolve) => {
    const start = Date.now();
    const client = url.startsWith('https') ? https : http;
    const req = client.get(`${url}/health`, { timeout: 5000,
      rejectUnauthorized: false }, (r) => {
      let data = '';
      r.on('data', chunk => data += chunk);
      r.on('end', () => {
        try {
          resolve({ status: 'ok', latencyMs: Date.now() - start, response: JSON.parse(data) });
        } catch {
          resolve({ status: 'ok', latencyMs: Date.now() - start });
        }
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

// ─── Proxy routes ─────────────────────────────────────────────────────────────
const proxyOpts = (target) => ({
  target,
  changeOrigin: true,
  secure: false,
  on: {
    error: (err, req, res) => {
      console.error(`Proxy error → ${target}:`, err.message);
      res.status(502).json({ error: 'Service unavailable', target });
    },
  },
});

// /api/auth/**  → auth-service
app.use('/api/auth', createProxyMiddleware(proxyOpts(SERVICES.auth)));

// /api/progress/** → progress-service
app.use('/api/progress', createProxyMiddleware(proxyOpts(SERVICES.progress)));

// /api/poses/** → pose-service
app.use('/api/poses', createProxyMiddleware(proxyOpts(SERVICES.pose)));

// /api/notifications/** → notification-service
app.use('/api/notifications', createProxyMiddleware(proxyOpts(SERVICES.notification)));

// ─── 404 fallback ─────────────────────────────────────────────────────────────
app.use((req, res) => {
  res.status(404).json({
    error: 'Route not found',
    availableRoutes: [
      'GET  /health',
      'GET  /status',
      'ANY  /api/auth/**',
      'ANY  /api/progress/**',
      'ANY  /api/poses/**',
      'ANY  /api/notifications/**',
    ],
  });
});

// ─── Start ────────────────────────────────────────────────────────────────────
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  console.log(`✅ api-gateway running on port ${PORT}`);
  console.log(`   /api/auth          → ${SERVICES.auth}`);
  console.log(`   /api/progress      → ${SERVICES.progress}`);
  console.log(`   /api/poses         → ${SERVICES.pose}`);
  console.log(`   /api/notifications → ${SERVICES.notification}`);
});
