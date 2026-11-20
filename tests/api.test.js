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

test('auth register, login, me, and logout', async () => {
  const badReg = await api('POST', '/api/auth/register', { email: 'a@test.com', password: '123' });
  assert.equal(badReg.status, 400);

  const reg = await api('POST', '/api/auth/register', { email: 'a@test.com', password: 'Password1' });
  assert.equal(reg.status, 201);
  assert.equal(reg.data.email, 'a@test.com');

  const missingField = await api('POST', '/api/auth/login', { email: 'a@test.com' });
  assert.equal(missingField.status, 400);

  const wrongPass = await api('POST', '/api/auth/login', { email: 'a@test.com', password: 'Wrong123' });
  assert.equal(wrongPass.status, 401);

  const me = await api('GET', '/api/auth/me', null, reg.data.token);
  assert.equal(me.status, 200);
  assert.equal(me.data.email, 'a@test.com');

  const out = await api('POST', '/api/auth/logout', {}, reg.data.token);
  assert.equal(out.status, 204);

  const afterOut = await api('GET', '/api/auth/me', null, reg.data.token);
  assert.equal(afterOut.status, 401);
});

test('tasks CRUD, validation, and user isolation', async () => {
  const noAuth = await api('GET', '/api/tasks');
  assert.equal(noAuth.status, 401);

  const u1 = await api('POST', '/api/auth/register', { email: 'u1@test.com', password: 'Password1' });
  const u2 = await api('POST', '/api/auth/register', { email: 'u2@test.com', password: 'Password1' });

  const created = await api('POST', '/api/tasks', { title: 'Study Node.js', priority: 'high' }, u1.data.token);
  assert.equal(created.status, 201);
  assert.equal(created.data.done, false);

  const list = await api('GET', '/api/tasks', null, u1.data.token);
  assert.equal(list.status, 200);
  assert.equal(list.data.length, 1);

  const otherGet = await api('GET', `/api/tasks/${created.data.id}`, null, u2.data.token);
  assert.equal(otherGet.status, 404);

  const patched = await api('PATCH', `/api/tasks/${created.data.id}`, { done: true }, u1.data.token);
  assert.equal(patched.status, 200);
  assert.equal(patched.data.done, true);

  const emptyPatch = await api('PATCH', `/api/tasks/${created.data.id}`, { unknown: 1 }, u1.data.token);
  assert.equal(emptyPatch.status, 400);

  const deleted = await api('DELETE', `/api/tasks/${created.data.id}`, null, u1.data.token);
  assert.equal(deleted.status, 204);
});
