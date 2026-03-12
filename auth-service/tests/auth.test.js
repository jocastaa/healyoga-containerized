// auth-service/tests/auth.test.js
// Run: npm test
// Uses Node 20 built-in test runner — no extra dependencies needed

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3002';

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
    assert.equal(body.service, 'auth-service');
    assert.ok(body.timestamp);
  });
});

// ─── Register validation ──────────────────────────────────────────────────────
describe('POST /auth/register — validation', () => {
  test('rejects missing email', async () => {
    const { status, body } = await post('/auth/register', { password: 'password123', fullName: 'Test User' });
    assert.equal(status, 400);
    assert.ok(body.errors);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('email')));
  });

  test('rejects invalid email format', async () => {
    const { status, body } = await post('/auth/register', {
      email: 'not-an-email', password: 'password123', fullName: 'Test User',
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('email')));
  });

  test('rejects short password', async () => {
    const { status, body } = await post('/auth/register', {
      email: 'test@example.com', password: '123', fullName: 'Test User',
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('password')));
  });

  test('rejects short fullName', async () => {
    const { status, body } = await post('/auth/register', {
      email: 'test@example.com', password: 'password123', fullName: 'A',
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('fullname')));
  });

  test('rejects age out of range', async () => {
    const { status, body } = await post('/auth/register', {
      email: 'test@example.com', password: 'password123', fullName: 'Test User', age: 999,
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('age')));
  });
});

// ─── Login validation ─────────────────────────────────────────────────────────
describe('POST /auth/login — validation', () => {
  test('rejects missing credentials', async () => {
    const { status, body } = await post('/auth/login', {});
    assert.equal(status, 400);
    assert.ok(body.errors);
  });

  test('rejects wrong credentials', async () => {
    const { status } = await post('/auth/login', {
      email: 'nonexistent@example.com', password: 'wrongpassword',
    });
    assert.equal(status, 401);
  });
});

// ─── Profile — invalid UUID ───────────────────────────────────────────────────
describe('GET /auth/profile/:userId — validation', () => {
  test('rejects non-UUID userId', async () => {
    const { status, body } = await get('/auth/profile/not-a-uuid');
    assert.equal(status, 400);
    assert.ok(body.error.toLowerCase().includes('uuid'));
  });
});
