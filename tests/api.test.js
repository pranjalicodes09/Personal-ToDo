const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const testDb = path.join(__dirname, 'test.db');
fs.rmSync(testDb, { force: true });
process.env.DB_PATH = testDb;

const app = require('../server');

let server;
let baseUrl;

test.before(() => {
  server = app.listen(0);
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

test.after(() => {
  server.close();
});

async function api(method, route, body, token) {
  const headers = {};
  if (body) headers['Content-Type'] = 'application/json';
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(baseUrl + route, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined
  });

  const data = res.status === 204 ? null : await res.json();
  return { status: res.status, data };
}

test('auth endpoints handle register, login, and logout', async () => {
  const shortPass = await api('POST', '/api/auth/register', { email: 'a@test.com', password: '123' });
  assert.equal(shortPass.status, 400);

  const reg = await api('POST', '/api/auth/register', { email: 'a@test.com', password: 'Password1' });
  assert.equal(reg.status, 201);
  assert.ok(reg.data.token);

  const badLogin = await api('POST', '/api/auth/login', { email: 'a@test.com', password: 'Wrong123' });
  assert.equal(badLogin.status, 401);

  const logout = await api('POST', '/api/auth/logout', {}, reg.data.token);
  assert.equal(logout.status, 204);

  const me = await api('GET', '/api/auth/me', null, reg.data.token);
  assert.equal(me.status, 401);
});

test('tasks require auth, support CRUD, and isolate users', async () => {
  const unauth = await api('GET', '/api/tasks');
  assert.equal(unauth.status, 401);

  const u1 = await api('POST', '/api/auth/register', { email: 'u1@test.com', password: 'Password1' });
  const u2 = await api('POST', '/api/auth/register', { email: 'u2@test.com', password: 'Password1' });

  const created = await api('POST', '/api/tasks', { title: 'Study Node.js', priority: 'high' }, u1.data.token);
  assert.equal(created.status, 201);
  const id = created.data.task.id;

  const forbiddenGet = await api('GET', `/api/tasks/${id}`, null, u2.data.token);
  assert.equal(forbiddenGet.status, 404);

  const updated = await api('PATCH', `/api/tasks/${id}`, { completed: true }, u1.data.token);
  assert.equal(updated.status, 200);
  assert.equal(updated.data.task.completed, true);

  const deleted = await api('DELETE', `/api/tasks/${id}`, null, u1.data.token);
  assert.equal(deleted.status, 204);
});
