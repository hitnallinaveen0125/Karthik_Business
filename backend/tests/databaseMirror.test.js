const test = require('node:test');
const assert = require('node:assert/strict');
const { sameMongoTarget } = require('../config/database');

test('mirror configuration rejects the same host and database even with different query options', () => {
  assert.equal(
    sameMongoTarget(
      'mongodb://127.0.0.1:27017/anantaora?directConnection=true',
      'mongodb://127.0.0.1:27017/anantaora'
    ),
    true
  );
});

test('mirror configuration allows different database servers', () => {
  assert.equal(
    sameMongoTarget(
      'mongodb+srv://atlas.example.mongodb.net/anantaora',
      'mongodb://127.0.0.1:27017/anantaora'
    ),
    false
  );
});

test('mirror configuration distinguishes databases on different ports', () => {
  assert.equal(
    sameMongoTarget(
      'mongodb://127.0.0.1:27017/anantaora',
      'mongodb://127.0.0.1:27018/anantaora'
    ),
    false
  );
});
