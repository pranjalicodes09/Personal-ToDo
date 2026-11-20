const db = require('../database/db');

module.exports = (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.split(' ')[1] : null;

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }

  const row = db.prepare(`
    SELECT s.expires_at, u.id, u.email, u.name
    FROM sessions s
    JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);

  if (!row) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  if (Date.parse(row.expires_at) <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return res.status(401).json({ error: 'Session expired' });
  }

  req.token = token;
  req.user = { id: row.id, email: row.email, name: row.name };
  next();
};
