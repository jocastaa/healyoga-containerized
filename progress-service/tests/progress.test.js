// progress-service/tests/progress.test.js
// Run: npm test
// Uses Node 20 built-in test runner — no extra dependencies needed

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3000';
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
  test('returns 200 with status ok', async () => {
    const { status, body } = await get('/health');
    assert.equal(status, 200);
    assert.equal(body.status, 'ok');
    assert.equal(body.service, 'progress-service');
  });
});

// ─── Complete session — validation ───────────────────────────────────────────
describe('POST /progress/:userId/complete — validation', () => {
  test('rejects invalid UUID', async () => {
    const { status, body } = await post(`/progress/${INVALID_UUID}/complete`, { level: 'Beginner' });
    assert.equal(status, 400);
    assert.ok(body.error.toLowerCase().includes('uuid'));
  });

  test('rejects missing level', async () => {
    const { status, body } = await post(`/progress/${VALID_UUID}/complete`, {});
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('level')));
  });

  test('rejects invalid level enum', async () => {
    const { status, body } = await post(`/progress/${VALID_UUID}/complete`, { level: 'Expert' });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('level')));
  });

  test('accepts valid level values', async () => {
    // Should not return 400 (may return 404 if user doesn't exist — that's fine)
    for (const level of ['Beginner', 'Intermediate', 'Advanced']) {
      const { status } = await post(`/progress/${VALID_UUID}/complete`, { level });
      assert.ok(status !== 400, `Expected non-400 for level=${level}, got ${status}`);
    }
  });
});

// ─── Unlock — validation ──────────────────────────────────────────────────────
describe('POST /progress/:userId/unlock — validation', () => {
  test('rejects Beginner as unlock target', async () => {
    const { status, body } = await post(`/progress/${VALID_UUID}/unlock`, { level: 'Beginner' });
    assert.equal(status, 400);
    assert.ok(body.errors);
  });

  test('accepts Intermediate and Advanced', async () => {
    for (const level of ['Intermediate', 'Advanced']) {
      const { status } = await post(`/progress/${VALID_UUID}/unlock`, { level });
      assert.ok(status !== 400, `Expected non-400 for level=${level}`);
    }
  });
});
