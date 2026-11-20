const $ = (id) => document.getElementById(id);

let token = localStorage.getItem('token') || '';
let isRegister = false;
let currentStatus = 'all';

function el(tag, attrs = {}, ...children) {
  const node = document.createElement(tag);
  Object.entries(attrs).forEach(([k, v]) => {
    if (k === 'className') node.className = v;
    else if (k.startsWith('on')) node.addEventListener(k.slice(2).toLowerCase(), v);
    else node.setAttribute(k, v);
  });
  children.flat().forEach((child) => {
    if (child != null) {
      node.appendChild(typeof child === 'string' ? document.createTextNode(child) : child);
    }
  });
  return node;
}

async function api(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = `Bearer ${token}`;

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401 && url !== '/api/auth/login') {
    logoutLocal();
    throw new Error('Session expired. Please log in again.');
  }

  if (res.status === 204) return null;

  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.errors ? Object.values(data.errors).join(', ') : (data.error || 'Request failed'));
  }
  return data;
}

function showError(boxId, msg) {
  const box = $(boxId);
  box.textContent = msg || '';
  box.classList.toggle('hidden', !msg);
}

function logoutLocal() {
  token = '';
  localStorage.removeItem('token');
  showError('auth-error', '');
  $('auth-section').classList.remove('hidden');
  $('app-section').classList.add('hidden');

  const clear = () => ['name', 'email', 'password'].forEach((id) => ($(id).value = ''));
  clear();
  setTimeout(clear, 50);
}

function openView(view) {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  const creating = view === 'create';
  $('create-panel').classList.toggle('hidden', !creating);
  $('tasks-panel').classList.toggle('hidden', creating);
  if (creating) return;

  currentStatus = view;
  const headings = { all: 'All Tasks', open: 'Open Tasks', completed: 'Completed Tasks' };
  $('panel-title').textContent = headings[view] || 'All Tasks';
  loadTasks();
}

function enterApp(user) {
  $('user-email').textContent = user.name ? `${user.name} (${user.email})` : user.email;
  $('auth-section').classList.add('hidden');
  $('app-section').classList.remove('hidden');
  openView('all');
}

function toggleAuthTab(registerMode) {
  isRegister = registerMode;
  $('show-login').classList.toggle('active', !registerMode);
  $('show-register').classList.toggle('active', registerMode);
  $('name-row').classList.toggle('hidden', !registerMode);
  $('auth-submit').textContent = registerMode ? 'Register' : 'Login';
  showError('auth-error', '');
}

$('show-login').onclick = () => toggleAuthTab(false);
$('show-register').onclick = () => toggleAuthTab(true);

$('auth-form').onsubmit = async (e) => {
  e.preventDefault();
  showError('auth-error', '');

  const body = { email: $('email').value, password: $('password').value };
  if (isRegister) body.name = $('name').value;

  try {
    const data = await api(isRegister ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    token = data.token;
    localStorage.setItem('token', token);
    $('auth-form').reset();
    enterApp(data.user);
  } catch (err) {
    showError('auth-error', err.message);
  }
};

$('logout-btn').onclick = async () => {
  await api('/api/auth/logout', { method: 'POST' }).catch(() => {});
  logoutLocal();
};

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.onclick = () => openView(btn.dataset.view);
});

$('quick-add-btn').onclick = () => openView('create');
$('cancel-create-btn').onclick = () => openView('all');

$('task-form').onsubmit = async (e) => {
  e.preventDefault();
  showError('app-error', '');

  try {
    await api('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: $('title').value,
        description: $('description').value,
        priority: $('priority').value,
        dueDate: $('due-date').value || null
      })
    });
    $('task-form').reset();
    $('priority').value = 'medium';
    openView('all');
  } catch (err) {
    showError('app-error', err.message);
  }
};

$('search').oninput = loadTasks;
$('filter-priority').onchange = loadTasks;
$('sort-by').onchange = loadTasks;

async function loadTasks() {
  showError('app-error', '');
  const [sort, order] = $('sort-by').value.split(':');
  const params = new URLSearchParams({ status: currentStatus, sort, order });

  const q = $('search').value.trim();
  const priority = $('filter-priority').value;
  if (q) params.set('q', q);
  if (priority) params.set('priority', priority);

  try {
    const { tasks } = await api(`/api/tasks?${params}`);
    renderTasks(tasks);
  } catch (err) {
    showError('app-error', err.message);
  }
}

function renderTasks(tasks) {
  const list = $('task-list');
  list.textContent = '';
  $('empty-msg').classList.toggle('hidden', tasks.length > 0);

  const today = new Date().toISOString().slice(0, 10);

  tasks.forEach((task) => {
    const overdue = !task.completed && task.dueDate && task.dueDate < today;

    const checkbox = el('input', {
      type: 'checkbox',
      'aria-label': 'Toggle completed',
      onChange: async () => {
        await api(`/api/tasks/${task.id}`, {
          method: 'PATCH',
          body: JSON.stringify({ completed: !task.completed })
        });
        loadTasks();
      }
    });
    checkbox.checked = task.completed;

    const meta = el(
      'div',
      { className: 'task-meta' },
      `Priority: ${task.priority}${task.dueDate ? ` | Due: ${task.dueDate}` : ''}`,
      overdue ? el('span', { className: 'overdue-tag' }, ' (OVERDUE)') : null
    );

    const item = el(
      'li',
      { className: `task-item${task.completed ? ' done' : ''}${overdue ? ' overdue' : ''}` },
      el(
        'div',
        { className: 'task-top' },
        checkbox,
        el(
          'div',
          { className: 'task-info' },
          el('p', { className: 'task-title' }, task.title),
          task.description ? el('p', { className: 'task-desc' }, task.description) : null,
          meta
        )
      ),
      el(
        'div',
        { className: 'task-buttons' },
        el('button', { type: 'button', className: 'pill-btn', onClick: () => editTask(task) }, 'Edit'),
        el('button', { type: 'button', className: 'danger', onClick: () => deleteTask(task.id) }, 'Delete')
      )
    );

    list.appendChild(item);
  });
}

async function editTask(task) {
  const title = prompt('Edit title:', task.title);
  if (title === null) return;
  const description = prompt('Edit description:', task.description);
  if (description === null) return;
  const dueDate = prompt('Edit due date (YYYY-MM-DD or leave blank):', task.dueDate || '');
  if (dueDate === null) return;

  try {
    await api(`/api/tasks/${task.id}`, {
      method: 'PATCH',
      body: JSON.stringify({ title, description, dueDate: dueDate.trim() || null })
    });
    loadTasks();
  } catch (err) {
    showError('app-error', err.message);
  }
}

async function deleteTask(id) {
  if (!confirm('Delete this task?')) return;
  try {
    await api(`/api/tasks/${id}`, { method: 'DELETE' });
    loadTasks();
  } catch (err) {
    showError('app-error', err.message);
  }
}

(async () => {
  if (!token) return;
  try {
    const { user } = await api('/api/auth/me');
    enterApp(user);
  } catch {
    logoutLocal();
  }
})();
