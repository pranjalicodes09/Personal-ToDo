const express = require('express');
const db = require('../database/db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const PRIORITIES = ['low', 'medium', 'high'];

const toTask = (row) => ({
  id: row.id,
  title: row.title,
  description: row.description,
  completed: Boolean(row.completed),
  priority: row.priority,
  dueDate: row.due_date,
  createdAt: row.created_at,
  updatedAt: row.updated_at
});

function isValidDate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function validateFields(body, isPatch = false) {
  const errors = {};
  const data = {};

  if (!isPatch || body.title !== undefined) {
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 140) {
      errors.title = 'Title must be 1-140 characters';
    } else {
      data.title = body.title.trim();
    }
  }

  if (body.description !== undefined) {
    if (body.description !== null && (typeof body.description !== 'string' || body.description.length > 2000)) {
      errors.description = 'Description must be 2000 characters or less';
    } else {
      data.description = body.description || '';
    }
  } else if (!isPatch) {
    data.description = '';
  }

  if (!isPatch || body.priority !== undefined) {
    const val = body.priority ?? 'medium';
    if (!PRIORITIES.includes(val)) {
      errors.priority = 'Priority must be low, medium, or high';
    } else {
      data.priority = val;
    }
  }

  if (body.dueDate !== undefined) {
    if (body.dueDate === null || body.dueDate === '') {
      data.due_date = null;
    } else if (!isValidDate(body.dueDate)) {
      errors.dueDate = 'dueDate must be YYYY-MM-DD or null';
    } else {
      data.due_date = body.dueDate;
    }
  } else if (!isPatch) {
    data.due_date = null;
  }

  if (isPatch && body.completed !== undefined) {
    if (typeof body.completed !== 'boolean') {
      errors.completed = 'Completed must be a boolean';
    } else {
      data.completed = body.completed ? 1 : 0;
    }
  }

  return { errors, data };
}

router.use(requireAuth);

router.param('id', (req, res, next, rawId) => {
  if (!/^\d+$/.test(rawId)) return res.status(404).json({ error: 'Task not found' });
  const task = db.prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?').get(Number(rawId), req.user.id);
  if (!task) return res.status(404).json({ error: 'Task not found' });
  req.task = task;
  next();
});

router.get('/', (req, res) => {
  const { status = 'all', priority, q, sort = 'createdAt', order = 'desc' } = req.query;

  if (!['all', 'open', 'completed'].includes(status)) {
    return res.status(400).json({ errors: { status: 'Invalid status' } });
  }
  if (priority && !PRIORITIES.includes(priority)) {
    return res.status(400).json({ errors: { priority: 'Invalid priority' } });
  }
  if (!['createdAt', 'dueDate', 'priority'].includes(sort)) {
    return res.status(400).json({ errors: { sort: 'Invalid sort field' } });
  }
  if (!['asc', 'desc'].includes(order)) {
    return res.status(400).json({ errors: { order: 'Invalid order' } });
  }

  const where = ['user_id = ?'];
  const params = [req.user.id];

  if (status === 'open') where.push('completed = 0');
  if (status === 'completed') where.push('completed = 1');
  if (priority) {
    where.push('priority = ?');
    params.push(priority);
  }
  if (q?.trim()) {
    where.push('(LOWER(title) LIKE ? OR LOWER(description) LIKE ?)');
    const term = `%${q.trim().toLowerCase()}%`;
    params.push(term, term);
  }

  const dir = order.toUpperCase();
  const orderMap = {
    createdAt: `created_at ${dir}, id ${dir}`,
    dueDate: order === 'asc'
      ? 'CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, id ASC'
      : 'CASE WHEN due_date IS NULL THEN 0 ELSE 1 END, due_date DESC, id DESC',
    priority: `CASE priority WHEN 'low' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ${dir}, id ${dir}`
  };

  const rows = db.prepare(`SELECT * FROM tasks WHERE ${where.join(' AND ')} ORDER BY ${orderMap[sort]}`).all(...params);
  res.json({ tasks: rows.map(toTask) });
});

router.post('/', (req, res) => {
  const { errors, data } = validateFields(req.body || {}, false);
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO tasks (user_id, title, description, completed, priority, due_date, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?, ?, ?)
  `).run(req.user.id, data.title, data.description, data.priority, data.due_date, now, now);

  const created = db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json({ task: toTask(created) });
});

router.get('/:id', (req, res) => {
  res.json({ task: toTask(req.task) });
});

router.patch('/:id', (req, res) => {
  const { errors, data } = validateFields(req.body || {}, true);
  if (Object.keys(errors).length) return res.status(400).json({ errors });

  const next = { ...req.task, ...data, updated_at: new Date().toISOString() };
  db.prepare(`
    UPDATE tasks
    SET title = ?, description = ?, completed = ?, priority = ?, due_date = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(next.title, next.description, next.completed, next.priority, next.due_date, next.updated_at, req.task.id, req.user.id);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.task.id);
  res.json({ task: toTask(updated) });
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(req.task.id, req.user.id);
  res.status(204).send();
});

module.exports = router;
