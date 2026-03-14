const express = require('express');
const cors = require('cors');
const https = require('https');
const http = require('http');

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
  const ping = (url) => new Promise((resolve) => {
    const start = Date.now();
    const client = url.startsWith('https') ? https : http;
    const req = client.get(
      `${url}/health`,
      { timeout: 5000, rejectUnauthorized: false },
      (r) => {
        let data = '';
        r.on('data', chunk => data += chunk);
        r.on('end', () => {
          try { resolve({ status: 'ok', latencyMs: Date.now() - start, response: JSON.parse(data) }); }
          catch { resolve({ status: 'ok', latencyMs: Date.now() - start }); }
        });
      }
    );
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

// ─── Manual proxy function ────────────────────────────────────────────────────
// Uses node's native http/https — avoids http-proxy-middleware TLS issues on Render
function manualProxy(serviceBase) {
  return (req, res) => {
    const targetUrl = new URL(req.originalUrl, serviceBase);
    const isHttps = targetUrl.protocol === 'https:';
    const client = isHttps ? https : http;

    const options = {
      hostname: targetUrl.hostname,
      port: targetUrl.port || (isHttps ? 443 : 80),
      path: targetUrl.pathname + (targetUrl.search || ''),
      method: req.method,
      headers: {
        ...req.headers,
        host: targetUrl.hostname,  // override host header
      },
      rejectUnauthorized: false,   // allow Render self-signed certs
      timeout: 60000,
    };

    console.log(`[Gateway] ${req.method} ${req.originalUrl} → ${targetUrl.href}`);

    const proxyReq = client.request(options, (proxyRes) => {
      res.status(proxyRes.statusCode);
      Object.entries(proxyRes.headers).forEach(([k, v]) => {
        // Skip hop-by-hop headers
        if (!['transfer-encoding', 'connection', 'keep-alive'].includes(k)) {
          res.setHeader(k, v);
        }
      });
      proxyRes.pipe(res);
    });

    proxyReq.on('error', (err) => {
      console.error(`[Gateway] Proxy error → ${serviceBase}: ${err.code} – ${err.message}`);
      if (!res.headersSent) {
        res.status(502).json({
          error: 'Service unavailable',
          downstream: serviceBase,
          reason: err.code,
        });
      }
    });

    proxyReq.on('timeout', () => {
      proxyReq.destroy();
      if (!res.headersSent) {
        res.status(504).json({ error: 'Gateway timeout', downstream: serviceBase });
      }
    });

    // Forward request body
    if (['POST', 'PUT', 'PATCH'].includes(req.method) && req.body) {
      const body = JSON.stringify(req.body);
      proxyReq.setHeader('Content-Type', 'application/json');
      proxyReq.setHeader('Content-Length', Buffer.byteLength(body));
      proxyReq.write(body);
    }

    proxyReq.end();
  };
}

// ─── Routes ───────────────────────────────────────────────────────────────────
app.use('/auth',          manualProxy(SERVICES.auth));
app.use('/progress',      manualProxy(SERVICES.progress));
app.use('/poses',         manualProxy(SERVICES.pose));
app.use('/notifications', manualProxy(SERVICES.notification));

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