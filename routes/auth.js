const express = require('express');
const crypto = require('crypto');
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + TOKEN_TTL_MS).toISOString();

  db.prepare(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(token, userId, expiresAt, now.toISOString());

  return { token, expiresAt };
}

function isValidEmail(email) {
  return (
    typeof email === 'string' &&
    email.length <= 120 &&
    /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)
  );
}

function isValidPassword(password) {
  return (
    typeof password === 'string' &&
    password.length >= 8 &&
    password.length <= 128 &&
    /[A-Za-z]/.test(password) &&
    /[0-9]/.test(password)
  );
}

// POST /api/auth/register
router.post('/register', async (req, res) => {
  const { email, password, name } = req.body || {};
  const errors = {};

  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';
  if (!isValidEmail(normalizedEmail)) {
    errors.email = 'Valid email (max 120 characters) is required';
  }

  if (!isValidPassword(password)) {
    errors.password = 'Password must be 8-128 characters with at least 1 letter and 1 digit';
  }

  let cleanName = null;
  if (name !== undefined && name !== null && String(name).trim() !== '') {
    if (typeof name !== 'string' || name.trim().length > 80) {
      errors.name = 'Name must be 80 characters or fewer';
    } else {
      cleanName = name.trim();
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  const existing = db.prepare('SELECT id FROM users WHERE email = ?').get(normalizedEmail);
  if (existing) {
    return res.status(409).json({ error: 'Email is already registered' });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const createdAt = new Date().toISOString();

  const result = db
    .prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?, ?, ?, ?)')
    .run(normalizedEmail, passwordHash, cleanName, createdAt);

  const user = {
    id: Number(result.lastInsertRowid),
    email: normalizedEmail,
    name: cleanName
  };

  const session = createSession(user.id);

  return res.status(201).json({
    token: session.token,
    expiresAt: session.expiresAt,
    user
  });
});

// POST /api/auth/login
router.post('/login', async (req, res) => {
  const { email, password } = req.body || {};
  const normalizedEmail = typeof email === 'string' ? email.trim().toLowerCase() : '';

  if (!normalizedEmail || typeof password !== 'string') {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const userRow = db
    .prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?')
    .get(normalizedEmail);

  if (!userRow) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const match = await bcrypt.compare(password, userRow.password_hash);
  if (!match) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const session = createSession(userRow.id);

  return res.status(200).json({
    token: session.token,
    expiresAt: session.expiresAt,
    user: {
      id: userRow.id,
      email: userRow.email,
      name: userRow.name
    }
  });
});

// POST /api/auth/logout
router.post('/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  return res.status(204).send();
});

// GET /api/auth/me
router.get('/me', requireAuth, (req, res) => {
  return res.status(200).json({
    user: req.user
  });
});

module.exports = router;
