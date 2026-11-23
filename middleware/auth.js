const db = require('../database/db'); //Required to query the sessions and users

module.exports = (req, res, next) => {
  const header = req.headers.authorization;
  const token = header?.startsWith('Bearer ') ? header.split(' ')[1] : null;
  //.split strips bearer to extract the token from header 

  if (!token) {
    return res.status(401).json({ error: 'Unauthorized' });
  }
  
  //Verifies token and retrieves user info from the database
  const row = db.prepare(`
    SELECT s.expires_at, u.id, u.email, u.name
    FROM sessions s JOIN users u ON u.id = s.user_id
    WHERE s.token = ?
  `).get(token);

  if (!row) {
    return res.status(401).json({ error: 'Invalid session' });
  }

  //Session expiry check 
  if (Date.parse(row.expires_at) <= Date.now()) {
    db.prepare('DELETE FROM sessions WHERE token = ?').run(token);
    return res.status(401).json({ error: 'Session expired' });
  }

  req.token = token;//attaches active token strung onto each req
  req.user = { id: row.id, email: row.email, name: row.name };//Attaches the verfied user object onto req
  next();//tells express to comtinue to next route after the authentication succeeded
};
