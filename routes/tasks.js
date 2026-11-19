const express = require('express');
const db = require('../database/db');
const requireAuth = require('../middleware/auth');

const router = express.Router();
const VALID_PRIORITIES = ['low', 'medium', 'high'];

function formatTask(row) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    completed: Boolean(row.completed),
    priority: row.priority,
    dueDate: row.due_date,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function isValidCalendarDate(dateStr) {
  if (typeof dateStr !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return false;
  }
  const [year, month, day] = dateStr.split('-').map(Number);
  const parsed = new Date(Date.UTC(year, month - 1, day));
  return (
    parsed.getUTCFullYear() === year &&
    parsed.getUTCMonth() === month - 1 &&
    parsed.getUTCDate() === day
  );
}

function parsePositiveId(rawId) {
  if (!/^\d+$/.test(String(rawId))) return null;
  const num = Number(rawId);
  return Number.isSafeInteger(num) && num > 0 ? num : null;
}

router.use(requireAuth);

// GET /api/tasks
router.get('/', (req, res) => {
  const { status = 'all', priority, q, sort = 'createdAt', order = 'desc' } = req.query;

  if (!['all', 'open', 'completed'].includes(status)) {
    return res.status(400).json({ errors: { status: 'Status must be all, open, or completed' } });
  }

  if (priority !== undefined && !VALID_PRIORITIES.includes(priority)) {
    return res.status(400).json({ errors: { priority: 'Priority must be low, medium, or high' } });
  }

  if (!['createdAt', 'dueDate', 'priority'].includes(sort)) {
    return res.status(400).json({ errors: { sort: 'Sort must be createdAt, dueDate, or priority' } });
  }

  if (!['asc', 'desc'].includes(order)) {
    return res.status(400).json({ errors: { order: 'Order must be asc or desc' } });
  }

  const conditions = ['user_id = ?'];
  const params = [req.user.id];

  if (status === 'open') {
    conditions.push('completed = 0');
  } else if (status === 'completed') {
    conditions.push('completed = 1');
  }

  if (priority) {
    conditions.push('priority = ?');
    params.push(priority);
  }

  if (typeof q === 'string' && q.trim() !== '') {
    conditions.push('(LOWER(title) LIKE ? OR LOWER(description) LIKE ?)');
    const pattern = `%${q.trim().toLowerCase()}%`;
    params.push(pattern, pattern);
  }

  const dir = order.toUpperCase();
  let orderByClause = `created_at ${dir}, id ${dir}`;

  if (sort === 'dueDate') {
    // Null due dates appear last when sorting asc, first when sorting desc
    orderByClause =
      order === 'asc'
        ? 'CASE WHEN due_date IS NULL THEN 1 ELSE 0 END ASC, due_date ASC, id ASC'
        : 'CASE WHEN due_date IS NULL THEN 0 ELSE 1 END ASC, due_date DESC, id DESC';
  } else if (sort === 'priority') {
    orderByClause = `CASE priority WHEN 'low' THEN 1 WHEN 'medium' THEN 2 WHEN 'high' THEN 3 END ${dir}, id ${dir}`;
  }

  const rows = db
    .prepare(`SELECT * FROM tasks WHERE ${conditions.join(' AND ')} ORDER BY ${orderByClause}`)
    .all(...params);

  return res.status(200).json({
    tasks: rows.map(formatTask)
  });
});

// POST /api/tasks
router.post('/', (req, res) => {
  const { title, description = '', priority = 'medium', dueDate = null } = req.body || {};
  const errors = {};

  if (typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 140) {
    errors.title = 'Title is required and must be 1-140 characters';
  }

  if (description !== undefined && description !== null) {
    if (typeof description !== 'string' || description.length > 2000) {
      errors.description = 'Description must be 2000 characters or fewer';
    }
  }

  if (!VALID_PRIORITIES.includes(priority)) {
    errors.priority = 'Priority must be low, medium, or high';
  }

  if (dueDate !== null && dueDate !== '') {
    if (!isValidCalendarDate(dueDate)) {
      errors.dueDate = 'dueDate must be a valid YYYY-MM-DD date or null';
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  const now = new Date().toISOString();
  const cleanTitle = title.trim();
  const cleanDescription = description || '';
  const cleanDueDate = dueDate === '' ? null : dueDate;

  const result = db
    .prepare(
      `INSERT INTO tasks (user_id, title, description, completed, priority, due_date, created_at, updated_at)
       VALUES (?, ?, ?, 0, ?, ?, ?, ?)`
    )
    .run(req.user.id, cleanTitle, cleanDescription, priority, cleanDueDate, now, now);

  const created = db.prepare('SELECT * FROM tasks WHERE id = ?').get(result.lastInsertRowid);
  return res.status(201).json({ task: formatTask(created) });
});

// GET /api/tasks/:id
router.get('/:id', (req, res) => {
  const taskId = parsePositiveId(req.params.id);
  if (!taskId) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const row = db
    .prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
    .get(taskId, req.user.id);

  if (!row) {
    return res.status(404).json({ error: 'Task not found' });
  }

  return res.status(200).json({ task: formatTask(row) });
});

// PATCH /api/tasks/:id
router.patch('/:id', (req, res) => {
  const taskId = parsePositiveId(req.params.id);
  if (!taskId) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const existing = db
    .prepare('SELECT * FROM tasks WHERE id = ? AND user_id = ?')
    .get(taskId, req.user.id);

  if (!existing) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const { title, description, completed, priority, dueDate } = req.body || {};
  const errors = {};

  let nextTitle = existing.title;
  if (title !== undefined) {
    if (typeof title !== 'string' || title.trim().length < 1 || title.trim().length > 140) {
      errors.title = 'Title must be 1-140 characters';
    } else {
      nextTitle = title.trim();
    }
  }

  let nextDescription = existing.description;
  if (description !== undefined) {
    if (typeof description !== 'string' || description.length > 2000) {
      errors.description = 'Description must be 2000 characters or fewer';
    } else {
      nextDescription = description;
    }
  }

  let nextCompleted = existing.completed;
  if (completed !== undefined) {
    if (typeof completed !== 'boolean') {
      errors.completed = 'Completed must be a boolean';
    } else {
      nextCompleted = completed ? 1 : 0;
    }
  }

  let nextPriority = existing.priority;
  if (priority !== undefined) {
    if (!VALID_PRIORITIES.includes(priority)) {
      errors.priority = 'Priority must be low, medium, or high';
    } else {
      nextPriority = priority;
    }
  }

  let nextDueDate = existing.due_date;
  if (dueDate !== undefined) {
    if (dueDate === null || dueDate === '') {
      nextDueDate = null;
    } else if (!isValidCalendarDate(dueDate)) {
      errors.dueDate = 'dueDate must be a valid YYYY-MM-DD date or null';
    } else {
      nextDueDate = dueDate;
    }
  }

  if (Object.keys(errors).length > 0) {
    return res.status(400).json({ errors });
  }

  const updatedAt = new Date().toISOString();

  db.prepare(
    `UPDATE tasks
     SET title = ?, description = ?, completed = ?, priority = ?, due_date = ?, updated_at = ?
     WHERE id = ? AND user_id = ?`
  ).run(
    nextTitle,
    nextDescription,
    nextCompleted,
    nextPriority,
    nextDueDate,
    updatedAt,
    taskId,
    req.user.id
  );

  const updated = db.prepare('SELECT * FROM tasks WHERE id = ?').get(taskId);
  return res.status(200).json({ task: formatTask(updated) });
});

// DELETE /api/tasks/:id
router.delete('/:id', (req, res) => {
  const taskId = parsePositiveId(req.params.id);
  if (!taskId) {
    return res.status(404).json({ error: 'Task not found' });
  }

  const result = db
    .prepare('DELETE FROM tasks WHERE id = ? AND user_id = ?')
    .run(taskId, req.user.id);

  if (result.changes === 0) {
    return res.status(404).json({ error: 'Task not found' });
  }

  return res.status(204).send();
});

module.exports = router;
