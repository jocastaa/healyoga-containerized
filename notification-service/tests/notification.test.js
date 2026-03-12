// notification-service/tests/notification.test.js
// Run: npm test
// Uses Node 20 built-in test runner — no extra dependencies needed

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3003';
const VALID_UUID = '00000000-0000-0000-0000-000000000001';
const INVALID_UUID = 'not-a-uuid';

async function post(path, body) {
  const res = await fetch(`${BASE_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  return { status: res.status, body: await res.json() };
}

async function get(path) {
  const res = await fetch(`${BASE_URL}${path}`);
  return { status: res.status, body: await res.json() };
}

// ─── Health ───────────────────────────────────────────────────────────────────
describe('GET /health', () => {
  test('returns 200 with status ok and stateless flag', async () => {
    const { status, body } = await get('/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'notification-service');
    assert.equal(body.stateless, true);
  });
});

// ─── Schedule — validation ────────────────────────────────────────────────────
describe('POST /notifications/schedule — validation', () => {
  test('rejects missing userId', async () => {
    const { status, body } = await post('/notifications/schedule', { hour: 9, minute: 0 });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('userid')));
  });

  test('rejects invalid UUID', async () => {
    const { status, body } = await post('/notifications/schedule', {
      userId: INVALID_UUID, hour: 9, minute: 0,
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('uuid')));
  });

  test('rejects hour > 23', async () => {
    const { status, body } = await post('/notifications/schedule', {
      userId: VALID_UUID, hour: 25, minute: 0,
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('hour')));
  });

  test('rejects hour < 0', async () => {
    const { status, body } = await post('/notifications/schedule', {
      userId: VALID_UUID, hour: -1, minute: 0,
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('hour')));
  });

  test('rejects minute > 59', async () => {
    const { status, body } = await post('/notifications/schedule', {
      userId: VALID_UUID, hour: 9, minute: 60,
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('minute')));
  });

  test('rejects non-integer hour', async () => {
    const { status, body } = await post('/notifications/schedule', {
      userId: VALID_UUID, hour: 9.5, minute: 0,
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('hour')));
  });

  test('accepts valid boundary values (0:00 and 23:59)', async () => {
    for (const [hour, minute] of [[0, 0], [23, 59]]) {
      const { status } = await post('/notifications/schedule', { userId: VALID_UUID, hour, minute });
      assert.ok(status !== 400, `Expected non-400 for ${hour}:${minute}, got ${status}`);
    }
  });
});

// ─── Send — validation ────────────────────────────────────────────────────────
describe('POST /notifications/send — validation', () => {
  test('rejects missing title', async () => {
    const { status, body } = await post('/notifications/send', { userId: VALID_UUID });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('title')));
  });

  test('rejects invalid UUID', async () => {
    const { status, body } = await post('/notifications/send', {
      userId: INVALID_UUID, title: 'Hello',
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('uuid')));
  });

  test('rejects title over 200 chars', async () => {
    const { status, body } = await post('/notifications/send', {
      userId: VALID_UUID, title: 'A'.repeat(201),
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('title')));
  });
});

// ─── Cancel — validation ──────────────────────────────────────────────────────
describe('DELETE /notifications/cancel/:userId — validation', () => {
  test('rejects invalid UUID in URL', async () => {
    const res = await fetch(`${BASE_URL}/notifications/cancel/${INVALID_UUID}`, { method: 'DELETE' });
    const body = await res.json();
    assert.equal(res.status, 400);
    assert.ok(body.error.toLowerCase().includes('uuid'));
  });
});
