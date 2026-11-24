const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { app } = require('../app');
const { User } = require('../models');

test('founder login accepts case-insensitive email and preserves exact password matching', async () => {
  const originalEnv = {
    email: process.env.FOUNDER_EMAIL,
    password: process.env.FOUNDER_PASSWORD,
    jwtSecret: process.env.JWT_SECRET,
  };
  process.env.FOUNDER_EMAIL = 'founder@example.test';
  process.env.FOUNDER_PASSWORD = 'local-test-password';
  process.env.JWT_SECRET = 'local-test-jwt-secret';

  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });

    const baseUrl = `http://127.0.0.1:${server.address().port}/api/admin/login`;
    const successfulLogin = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: '  FOUNDER@EXAMPLE.TEST  ', password: 'local-test-password' }),
    });
    assert.equal(successfulLogin.status, 200);
    assert.equal((await successfulLogin.json()).success, true);

    const unifiedLogin = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: '  FOUNDER@EXAMPLE.TEST  ', password: 'local-test-password' }),
    });
    const adminSession = await unifiedLogin.json();
    assert.equal(unifiedLogin.status, 200);
    assert.equal(adminSession.user.role, 'admin');
    assert.equal(jwt.verify(adminSession.token, process.env.JWT_SECRET).role, 'admin');

    const originalFindOne = User.findOne;
    User.findOne = () => ({ select: async () => null });
    let invalidUnifiedLogin;
    try {
      invalidUnifiedLogin = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/login`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ email: 'founder@example.test', password: 'incorrect-password' }),
      });
    } finally {
      User.findOne = originalFindOne;
    }
    assert.equal(invalidUnifiedLogin.status, 401);

    const failedLogin = await fetch(baseUrl, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'founder@example.test', password: 'incorrect-password' }),
    });
    assert.equal(failedLogin.status, 401);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    for (const [key, value] of Object.entries({
      FOUNDER_EMAIL: originalEnv.email,
      FOUNDER_PASSWORD: originalEnv.password,
      JWT_SECRET: originalEnv.jwtSecret,
    })) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
});
