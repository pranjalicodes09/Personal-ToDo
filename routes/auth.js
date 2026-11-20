const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const SESSION_MS = 24 * 60 * 60 * 1000;

function makeSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_MS).toISOString();

  db.prepare(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(token, userId, expiresAt, now);

  return { token, expiresAt };
}

router.post('/register', (req, res) => {
  const { password, name } = req.body || {};
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const errors = {};

  if (!email || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Valid email is required';
  }

  if (typeof password !== 'string' || password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = 'Password must be 8-128 chars with a letter and a number';
  }

  const trimmedName = typeof name === 'string' ? name.trim() : '';
  if (name != null && trimmedName.length > 80) {
    errors.name = 'Name must be 80 characters or less';
  }

  if (Object.keys(errors).length) {
    return res.status(400).json({ errors });
  }

  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const userName = trimmedName || null;
  const info = db
    .prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?, ?, ?, ?)')
    .run(email, hash, userName, new Date().toISOString());

  const user = { id: Number(info.lastInsertRowid), email, name: userName };
  const session = makeSession(user.id);

  res.status(201).json({ ...session, user });
});

router.post('/login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;

  if (!email || typeof password !== 'string') {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const user = db.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const session = makeSession(user.id);
  res.json({
    ...session,
    user: { id: user.id, email: user.email, name: user.name }
  });
});

router.post('/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.status(204).send();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ user: req.user });
});

module.exports = router;
