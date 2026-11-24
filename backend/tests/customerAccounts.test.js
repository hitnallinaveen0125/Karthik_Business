const test = require('node:test');
const assert = require('node:assert/strict');
const jwt = require('jsonwebtoken');
const { app } = require('../app');
const { User } = require('../models');

test('customers can register and log in with normalized email and hashed passwords', async () => {
  const original = {
    jwtSecret: process.env.JWT_SECRET,
    create: User.create,
    findOne: User.findOne,
  };
  process.env.JWT_SECRET = 'customer-account-test-jwt-secret';
  let storedUser;
  User.create = async ({ name, email, passwordHash }) => {
    storedUser = { _id: 'customer-test-id', name, email, passwordHash };
    return storedUser;
  };
  User.findOne = (query) => ({
    select: async () => (query.email === storedUser.email ? storedUser : null),
  });

  const server = app.listen(0, '127.0.0.1');
  try {
    await new Promise((resolve, reject) => {
      server.once('listening', resolve);
      server.once('error', reject);
    });
    const url = `http://127.0.0.1:${server.address().port}/api/auth`;
    const unsignedOrderResponse = await fetch(`http://127.0.0.1:${server.address().port}/api/payments/create-order`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ productId: 'prod_001' }),
    });
    assert.equal(unsignedOrderResponse.status, 401);

    const signupResponse = await fetch(`${url}/signup`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ name: 'Test Buyer', email: ' BUYER@example.test ', password: 'secure-test-pass' }),
    });
    const signup = await signupResponse.json();
    assert.equal(signupResponse.status, 201);
    assert.equal(signup.user.email, 'buyer@example.test');
    assert.equal(storedUser.passwordHash === 'secure-test-pass', false);
    assert.equal(jwt.verify(signup.token, process.env.JWT_SECRET).role, 'customer');

    const loginResponse = await fetch(`${url}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'BUYER@example.test', password: 'secure-test-pass' }),
    });
    const login = await loginResponse.json();
    assert.equal(loginResponse.status, 200);
    assert.equal(login.user.id, 'customer-test-id');
    assert.equal(login.user.role, 'customer');
    assert.equal(jwt.verify(login.token, process.env.JWT_SECRET).role, 'customer');

    const invalidLoginResponse = await fetch(`${url}/login`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ email: 'buyer@example.test', password: 'incorrect-password' }),
    });
    assert.equal(invalidLoginResponse.status, 401);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => (error ? reject(error) : resolve())));
    User.create = original.create;
    User.findOne = original.findOne;
    if (original.jwtSecret === undefined) delete process.env.JWT_SECRET;
    else process.env.JWT_SECRET = original.jwtSecret;
  }
});
