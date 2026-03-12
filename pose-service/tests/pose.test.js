// pose-service/tests/pose.test.js
// Run: npm test
// Uses Node 20 built-in test runner — no extra dependencies needed

const { test, describe } = require('node:test');
const assert = require('node:assert/strict');

const BASE_URL = process.env.TEST_URL || 'http://localhost:3001';
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
    assert.equal(body.service, 'pose-service');
  });
});

// ─── Pose activity — validation ───────────────────────────────────────────────
describe('POST /poses/:userId/activity — validation', () => {
  test('rejects invalid UUID', async () => {
    const { status, body } = await post(`/poses/${INVALID_UUID}/activity`, {
      poseId: 'pose_1', poseName: 'Mountain Pose', durationSeconds: 30, sessionLevel: 'Beginner',
    });
    assert.equal(status, 400);
    assert.ok(body.error.toLowerCase().includes('uuid'));
  });

  test('rejects missing poseId', async () => {
    const { status, body } = await post(`/poses/${VALID_UUID}/activity`, {
      poseName: 'Mountain Pose', durationSeconds: 30, sessionLevel: 'Beginner',
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('poseid')));
  });

  test('rejects zero durationSeconds', async () => {
    const { status, body } = await post(`/poses/${VALID_UUID}/activity`, {
      poseId: 'pose_1', poseName: 'Mountain Pose', durationSeconds: 0, sessionLevel: 'Beginner',
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('durationseconds')));
  });

  test('rejects negative durationSeconds', async () => {
    const { status, body } = await post(`/poses/${VALID_UUID}/activity`, {
      poseId: 'pose_1', poseName: 'Mountain Pose', durationSeconds: -10, sessionLevel: 'Beginner',
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('durationseconds')));
  });

  test('rejects durationSeconds exceeding 24 hours', async () => {
    const { status, body } = await post(`/poses/${VALID_UUID}/activity`, {
      poseId: 'pose_1', poseName: 'Mountain Pose', durationSeconds: 99999, sessionLevel: 'Beginner',
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('durationseconds')));
  });

  test('rejects invalid sessionLevel', async () => {
    const { status, body } = await post(`/poses/${VALID_UUID}/activity`, {
      poseId: 'pose_1', poseName: 'Mountain Pose', durationSeconds: 30, sessionLevel: 'Expert',
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('sessionlevel')));
  });

  test('accepts valid payload', async () => {
    const { status } = await post(`/poses/${VALID_UUID}/activity`, {
      poseId: 'pose_1', poseName: 'Mountain Pose', durationSeconds: 30, sessionLevel: 'Beginner',
    });
    // 200 if user exists in DB, otherwise non-400 error — both are fine for validation test
    assert.ok(status !== 400, `Expected non-400, got ${status}`);
  });
});

// ─── Pose complete — validation ───────────────────────────────────────────────
describe('POST /poses/:userId/complete — validation', () => {
  test('rejects missing sessionLevel', async () => {
    const { status, body } = await post(`/poses/${VALID_UUID}/complete`, { poseId: 'pose_1' });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('sessionlevel')));
  });

  test('rejects invalid sessionLevel enum', async () => {
    const { status, body } = await post(`/poses/${VALID_UUID}/complete`, {
      poseId: 'pose_1', sessionLevel: 'Ninja',
    });
    assert.equal(status, 400);
    assert.ok(body.errors.some(e => e.toLowerCase().includes('sessionlevel')));
  });
});

// ─── Session level param — validation ────────────────────────────────────────
describe('GET /poses/:userId/:sessionLevel — validation', () => {
  test('rejects invalid sessionLevel in URL', async () => {
    const { status, body } = await get(`/poses/${VALID_UUID}/Expert`);
    assert.equal(status, 400);
    assert.ok(body.error.toLowerCase().includes('sessionlevel'));
  });
});
