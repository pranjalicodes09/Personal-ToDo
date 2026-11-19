const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

// Point tests to a separate database file so todo.db stays clean
const testDb = path.join(__dirname, 'test.db');
if (fs.existsSync(testDb)) fs.unlinkSync(testDb);
process.env.DB_PATH = testDb;

const app = require('../server');

let server;
let url;

test.before(() => {
  server = app.listen(0);
  url = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
});

async function post(route, body, token) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;

  const res = await fetch(url + route, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  });
  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

test('1. Register, login, and logout work properly', async () => {
  // Reject short password with 400
  const bad = await post('/api/auth/register', { email: 'a@test.com', password: '123' });
  assert.equal(bad.status, 400);

  // Register valid user -> 201
  const reg = await post('/api/auth/register', { email: 'a@test.com', password: 'Password1' });
  assert.equal(reg.status, 201);
  assert.ok(reg.data.token);

  // Wrong password -> 401
  const wrongPass = await post('/api/auth/login', { email: 'a@test.com', password: 'Wrong123' });
  assert.equal(wrongPass.status, 401);

  // Logout -> 204, then token stops working -> 401
  const out = await post('/api/auth/logout', {}, reg.data.token);
  assert.equal(out.status, 204);

  const meRes = await fetch(url + '/api/auth/me', {
    headers: { Authorization: 'Bearer ' + reg.data.token }
  });
  assert.equal(meRes.status, 401);
});

test('2. Tasks can be created, updated, deleted, and are private to each user', async () => {
  // Blocked without login -> 401
  const blocked = await fetch(url + '/api/tasks');
  assert.equal(blocked.status, 401);

  // Create two separate users
  const user1 = await post('/api/auth/register', { email: 'u1@test.com', password: 'Password1' });
  const user2 = await post('/api/auth/register', { email: 'u2@test.com', password: 'Password1' });

  // User 1 creates a task -> 201
  const created = await post('/api/tasks', { title: 'Study Node.js', priority: 'high' }, user1.data.token);
  assert.equal(created.status, 201);
  const taskId = created.data.task.id;

  // User 2 cannot see User 1's task -> 404
  const otherUserRes = await fetch(`${url}/api/tasks/${taskId}`, {
    headers: { Authorization: 'Bearer ' + user2.data.token }
  });
  assert.equal(otherUserRes.status, 404);

  // User 1 marks task completed -> 200
  const patchRes = await fetch(`${url}/api/tasks/${taskId}`, {
    method: 'PATCH',
    headers: {
      'Content-Type': 'application/json',
      Authorization: 'Bearer ' + user1.data.token
    },
    body: JSON.stringify({ completed: true })
  });
  assert.equal(patchRes.status, 200);

  // User 1 deletes task -> 204
  const delRes = await fetch(`${url}/api/tasks/${taskId}`, {
    method: 'DELETE',
    headers: { Authorization: 'Bearer ' + user1.data.token }
  });
  assert.equal(delRes.status, 204);
});
