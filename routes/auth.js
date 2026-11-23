//Imports, Router, and Constants
const express = require('express');
const crypto = require('crypto');//Import Node.js inbuilt crypto module to give unpredicatable tokens
const bcrypt = require('bcryptjs');
const db = require('../database/db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const SESSION_SECONDS = 24 * 60 * 60;

//Helper fun to create new sessions
function createSession(userId) {
  const token = crypto.randomBytes(32).toString('hex');
  const now = new Date().toISOString();
  const expiresAt = new Date(Date.now() + SESSION_SECONDS * 1000).toISOString();

  db.prepare(
    'INSERT INTO sessions (token, user_id, expires_at, created_at) VALUES (?, ?, ?, ?)'
  ).run(token, userId, expiresAt, now);

  return { token, expiresIn: SESSION_SECONDS };
}

//POST/ api/ auth/ register
router.post('/register', (req, res) => {
  const { password, name } = req.body || {};
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const errors = {};

  if (!email || email.length > 120 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    errors.email = 'Valid email is required';
  }
  if (typeof password !== 'string' || password.length < 8 || password.length > 128 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    errors.password = 'Password must be 8-128 chars with a letter and a digit';
  }
  if (name != null && (typeof name !== 'string' || name.trim().length > 80)) {
    errors.name = 'Name must be 80 characters or less';
  }

  if (Object.keys(errors).length) {
    return res.status(400).json({ errors });
  }

  if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) {
    return res.status(409).json({ error: 'Email already registered' });
  }

  const hash = bcrypt.hashSync(password, 10);
  const cleanName = typeof name === 'string' && name.trim() ? name.trim() : null;
  const info = db
    .prepare('INSERT INTO users (email, password_hash, name, created_at) VALUES (?, ?, ?, ?)')
    .run(email, hash, cleanName, new Date().toISOString());

  const user = { id: Number(info.lastInsertRowid), email, name: cleanName };
  const session = createSession(user.id);

  res.status(201).json({ ...user, ...session, user });
});

//POST/ API/ AUTH/ LOGIN
router.post('/login', (req, res) => {
  const email = typeof req.body?.email === 'string' ? req.body.email.trim().toLowerCase() : '';
  const password = req.body?.password;

  if (!email || typeof password !== 'string' || !password) {
    return res.status(400).json({ error: 'Email and password are required' });
  }

  const user = db.prepare('SELECT id, email, name, password_hash FROM users WHERE email = ?').get(email);
  if (!user || !bcrypt.compareSync(password, user.password_hash)) {
    return res.status(401).json({ error: 'Invalid email or password' });
  }

  const session = createSession(user.id);
  res.json({
    ...session,
    user: { id: user.id, email: user.email, name: user.name }
  });
});

//POST /LOGOUT, GET /ME, POST /CHANGE-PASSWORD
router.post('/logout', requireAuth, (req, res) => {
  db.prepare('DELETE FROM sessions WHERE token = ?').run(req.token);
  res.status(204).send();
});

router.get('/me', requireAuth, (req, res) => {
  res.json({ id: req.user.id, email: req.user.email, name: req.user.name });
});

//POST/ API/ AUTH/ CHANGE-PASSWORD
router.post('/change-password', requireAuth, (req, res) => {
  const currentPassword = req.body.currentPassword || '';
  const newPassword = req.body.newPassword || '';

  if (!currentPassword || !newPassword) {
    return res.status(400).json({ error: 'Both current and new passwords are required' });
  }

  const validPassword =
    newPassword.length >= 8 &&
    newPassword.length <= 128 &&
    /[A-Za-z]/.test(newPassword) &&
    /\d/.test(newPassword);

  if (!validPassword) {
    return res.status(400).json({
      error: 'New password must be 8-128 chars with a letter and a digit'
    });
  }

  if (currentPassword === newPassword) {
    return res.status(400).json({
      error: 'New password must be different from your current password'
    });
  }

  const user = db
    .prepare('SELECT id, password_hash FROM users WHERE id = ?')
    .get(req.user.id);

  const isMatch = user && bcrypt.compareSync(currentPassword, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Current password is incorrect' });
  }

  const passwordHash = bcrypt.hashSync(newPassword, 10);
  db.prepare('UPDATE users SET password_hash = ? WHERE id = ?').run(passwordHash, req.user.id);

  res.json({ ok: true, message: 'Password changed successfully' });
});

module.exports = router;

