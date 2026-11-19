const db = require('../database/db');

function requireAuth(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const token = authHeader.slice(7).trim();
  if (!token) {
    return res.status(401).json({ error: 'Authentication required' });
  }

  const session = db
    .prepare(
      `SELECT s.token, s.expires_at, u.id, u.email, u.name
       FROM sessions s
       JOIN users u ON u.id = s.user_id
       WHERE s.token = ?`
    )
    .get(token);

  if (!session) {
    return res.status(401).json({ error: 'Invalid or expired token' });
  }

  if (new Date(session.expires_at) <= new Date()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return res.status(401).json({ error: 'Token expired' });
  }

  req.token = token;
  req.user = {
    id: session.id,
    email: session.email,
    name: session.name
  };

  next();
}

module.exports = requireAuth;
