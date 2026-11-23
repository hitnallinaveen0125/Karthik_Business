const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { getPeriodStart, getRevenueBuckets } = require('../routes/adminRoutes');

test('weekly dashboard period starts on Monday in the India timezone', () => {
  const now = new Date('2026-11-25T10:00:00.000Z');
  assert.equal(getPeriodStart('weekly', now).toISOString(), '2026-11-22T18:30:00.000Z');
});

test('monthly and yearly dashboard periods start at the expected India calendar boundary', () => {
  const now = new Date('2026-11-25T10:00:00.000Z');
  assert.equal(getPeriodStart('monthly', now).toISOString(), '2026-10-31T18:30:00.000Z');
  assert.equal(getPeriodStart('yearly', now).toISOString(), '2025-12-31T18:30:00.000Z');
});

test('revenue chart buckets are complete through the current India day or month', () => {
  const now = new Date('2026-11-25T10:00:00.000Z');
  const weeklyStart = getPeriodStart('weekly', now);
  const yearlyStart = getPeriodStart('yearly', now);

  assert.deepEqual(
    getRevenueBuckets('weekly', weeklyStart, now).map((bucket) => bucket.key),
    ['2026-11-23', '2026-11-24', '2026-11-25']
  );
  assert.equal(getRevenueBuckets('yearly', yearlyStart, now).length, 11);
  assert.equal(getRevenueBuckets('yearly', yearlyStart, now)[10].key, '2026-11');
});

test('sales dashboard requires founder authentication and validates period filters', async () => {
  const previousSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = 'dashboard-route-test-secret';
  const { app } = require('../app');
  const server = app.listen(0, '127.0.0.1');

  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/dashboard`;
    const unauthorized = await fetch(baseUrl);
    assert.equal(unauthorized.status, 401);

    const founderToken = jwt.sign(
      { sub: 'founder', role: 'founder' },
      process.env.JWT_SECRET,
      { expiresIn: '1m' }
    );
    const invalidPeriod = await fetch(`${baseUrl}?period=daily`, {
      headers: { authorization: `Bearer ${founderToken}` },
    });
    assert.equal(invalidPeriod.status, 400);
  } finally {
    await new Promise((resolve, reject) => {
      server.close((error) => (error ? reject(error) : resolve()));
    });
    if (previousSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = previousSecret;
  }
});
