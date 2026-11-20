const express = require('express');
const db = require('../database/db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const PRIORITIES = ['low', 'medium', 'high'];

function toTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    done: Boolean(row.completed),
    priority: row.priority,
    dueDate: row.due_date,
    createdAt: row.created_at
  };
}

function isRealDate(str) {
  if (typeof str !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(str)) return false;
  const [y, m, d] = str.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d;
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

  if (!['all', 'open', 'done', 'completed'].includes(status)) {
    return res.status(400).json({ errors: { status: 'Invalid status' } });
  }
  if (priority && !PRIORITIES.includes(priority)) {
    return res.status(400).json({ errors: { priority: 'Invalid priority' } });
  }
  if (!['createdAt', 'dueDate', 'priority'].includes(sort)) {
    return res.status(400).json({ errors: { sort: 'Invalid sort' } });
  }
  if (!['asc', 'desc'].includes(order)) {
    return res.status(400).json({ errors: { order: 'Invalid order' } });
  }

  const sql = ['SELECT * FROM tasks WHERE user_id = ?'];
  const params = [req.user.id];

  if (status === 'open') sql.push('AND completed = 0');
  if (status === 'done' || status === 'completed') sql.push('AND completed = 1');

  if (priority) {
    sql.push('AND priority = ?');
    params.push(priority);
  }

  if (q && q.trim()) {
    sql.push('AND (LOWER(title) LIKE ? OR LOWER(description) LIKE ?)');
    const search = `%${q.trim().toLowerCase()}%`;
    params.push(search, search);
  }

  const dir = order.toUpperCase();
  if (sort === 'dueDate') {
    sql.push(
      order === 'asc'
        ? 'ORDER BY CASE WHEN due_date IS NULL THEN 1 ELSE 0 END, due_date ASC, id ASC'
        : 'ORDER BY CASE WHEN due_date IS NULL THEN 0 ELSE 1 END, due_date DESC, id DESC'
    );
  } else if (sort === 'priority') {
    sql.push(`ORDER BY CASE priority WHEN 'low' THEN 1 WHEN 'medium' THEN 2 ELSE 3 END ${dir}, id ${dir}`);
  } else {
    sql.push(`ORDER BY created_at ${dir}, id ${dir}`);
  }

  const rows = db.prepare(sql.join(' ')).all(...params);
  res.json(rows.map(toTask));
});

router.post('/', (req, res) => {
  const { title, description = '', priority = 'medium', dueDate = null } = req.body || {};
  const errors = {};

  if (typeof title !== 'string' || !title.trim() || title.trim().length > 120) {
    errors.title = 'Title must be 1-120 characters';
  }
  if (description !== null && (typeof description !== 'string' || description.length > 1000)) {
    errors.description = 'Description must be 1000 characters or less';
  }
  if (!PRIORITIES.includes(priority)) {
    errors.priority = 'Priority must be low, medium, or high';
  }
  if (dueDate !== null && dueDate !== '' && !isRealDate(dueDate)) {
    errors.dueDate = 'dueDate must be YYYY-MM-DD or null';
  }

  if (Object.keys(errors).length) {
    return res.status(400).json({ errors });
  }

  const now = new Date().toISOString();
  const info = db.prepare(`
    INSERT INTO tasks (user_id, title, description, completed, priority, due_date, created_at, updated_at)
    VALUES (?, ?, ?, 0, ?, ?, ?, ?)
  `).run(req.user.id, title.trim(), description || '', priority, dueDate || null, now, now);

  const created = db.prepare('SELECT * FROM tasks WHERE id = ?').get(info.lastInsertRowid);
  res.status(201).json(toTask(created));
});

router.get('/:id', (req, res) => {
  res.json(toTask(req.task));
});

router.patch('/:id', (req, res) => {
  const body = req.body || {};
  const errors = {};
  let changed = false;

  let title = req.task.title;
  if (body.title !== undefined) {
    changed = true;
    if (typeof body.title !== 'string' || !body.title.trim() || body.title.trim().length > 120) {
      errors.title = 'Title must be 1-120 characters';
    } else {
      title = body.title.trim();
    }
  }

  let description = req.task.description;
  if (body.description !== undefined) {
    changed = true;
    if (body.description !== null && (typeof body.description !== 'string' || body.description.length > 1000)) {
      errors.description = 'Description must be 1000 characters or less';
    } else {
      description = body.description || '';
    }
  }

  let priority = req.task.priority;
  if (body.priority !== undefined) {
    changed = true;
    if (!PRIORITIES.includes(body.priority)) {
      errors.priority = 'Priority must be low, medium, or high';
    } else {
      priority = body.priority;
    }
  }

  let dueDate = req.task.due_date;
  if (body.dueDate !== undefined) {
    changed = true;
    if (body.dueDate === null || body.dueDate === '') {
      dueDate = null;
    } else if (!isRealDate(body.dueDate)) {
      errors.dueDate = 'dueDate must be YYYY-MM-DD or null';
    } else {
      dueDate = body.dueDate;
    }
  }

  let completed = req.task.completed;
  const doneInput = body.done !== undefined ? body.done : body.completed;
  if (doneInput !== undefined) {
    changed = true;
    if (typeof doneInput !== 'boolean') {
      errors.done = 'done must be a boolean';
    } else {
      completed = doneInput ? 1 : 0;
    }
  }

  if (Object.keys(errors).length) return res.status(400).json({ errors });
  if (!changed) return res.status(400).json({ error: 'No valid fields sent' });

  db.prepare(`
    UPDATE tasks
    SET title = ?, description = ?, completed = ?, priority = ?, due_date = ?, updated_at = ?
    WHERE id = ? AND user_id = ?
  `).run(title, description, completed, priority, dueDate, new Date().toISOString(), req.task.id, req.user.id);

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(req.task.id);
  res.json(toTask(updated));
});

router.delete('/:id', (req, res) => {
  db.prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?').run(req.task.id, req.user.id);
  res.status(204).send();
});

module.exports = router;
