let token = localStorage.getItem('token') || '';
let isRegister = false;
let currentStatus = 'all';

const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const authError = document.getElementById('auth-error');
const appError = document.getElementById('app-error');
const taskList = document.getElementById('task-list');
const emptyMsg = document.getElementById('empty-msg');

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) headers.Authorization = 'Bearer ' + token;

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

function logoutLocal() {
  token = '';
  localStorage.removeItem('token');
  authError.classList.add('hidden');
  authSection.classList.remove('hidden');
  appSection.classList.add('hidden');

  const clear = () => {
    document.getElementById('name').value = '';
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
  };
  clear();
  setTimeout(clear, 50);
}

function openView(view) {
  document.querySelectorAll('.nav-item').forEach((btn) => {
    btn.classList.toggle('active', btn.dataset.view === view);
  });

  if (view === 'create') {
    document.getElementById('create-panel').classList.remove('hidden');
    document.getElementById('tasks-panel').classList.add('hidden');
    return;
  }

  document.getElementById('create-panel').classList.add('hidden');
  document.getElementById('tasks-panel').classList.remove('hidden');
  currentStatus = view === 'completed' ? 'done' : view;

  const titles = { all: 'All Tasks', open: 'Open Tasks', completed: 'Completed Tasks' };
  document.getElementById('panel-title').textContent = titles[view] || 'All Tasks';
  loadTasks();
}

function enterApp(user) {
  document.getElementById('user-email').textContent = user.name ? `${user.name} (${user.email})` : user.email;
  authSection.classList.add('hidden');
  appSection.classList.remove('hidden');
  openView('all');
}

function setAuthMode(registerMode) {
  isRegister = registerMode;
  document.getElementById('show-login').classList.toggle('active', !registerMode);
  document.getElementById('show-register').classList.toggle('active', registerMode);
  document.getElementById('name-row').classList.toggle('hidden', !registerMode);
  document.getElementById('auth-submit').textContent = registerMode ? 'Register' : 'Login';
  authError.classList.add('hidden');
}

document.getElementById('show-login').addEventListener('click', () => setAuthMode(false));
document.getElementById('show-register').addEventListener('click', () => setAuthMode(true));

document.getElementById('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');

  const body = {
    email: document.getElementById('email').value,
    password: document.getElementById('password').value
  };
  if (isRegister) body.name = document.getElementById('name').value;

  try {
    const data = await request(isRegister ? '/api/auth/register' : '/api/auth/login', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    token = data.token;
    localStorage.setItem('token', token);
    document.getElementById('auth-form').reset();
    enterApp(data.user || data);
  } catch (err) {
    authError.textContent = err.message;
    authError.classList.remove('hidden');
  }
});

document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } catch {}
  logoutLocal();
});

document.querySelectorAll('.nav-item').forEach((btn) => {
  btn.addEventListener('click', () => openView(btn.dataset.view));
});

document.getElementById('quick-add-btn').addEventListener('click', () => openView('create'));
document.getElementById('cancel-create-btn').addEventListener('click', () => openView('all'));

document.getElementById('task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  appError.classList.add('hidden');

  try {
    await request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify({
        title: document.getElementById('title').value,
        description: document.getElementById('description').value,
        priority: document.getElementById('priority').value,
        dueDate: document.getElementById('due-date').value || null
      })
    });
    document.getElementById('task-form').reset();
    document.getElementById('priority').value = 'medium';
    openView('all');
  } catch (err) {
    appError.textContent = err.message;
    appError.classList.remove('hidden');
  }
});

document.getElementById('search').addEventListener('input', loadTasks);
document.getElementById('filter-priority').addEventListener('change', loadTasks);
document.getElementById('sort-by').addEventListener('change', loadTasks);

async function loadTasks() {
  appError.classList.add('hidden');
  const [sort, order] = document.getElementById('sort-by').value.split(':');
  const params = new URLSearchParams({ status: currentStatus, sort, order });

  const q = document.getElementById('search').value.trim();
  const priority = document.getElementById('filter-priority').value;
  if (q) params.set('q', q);
  if (priority) params.set('priority', priority);

  try {
    const tasks = await request('/api/tasks?' + params.toString());
    renderTasks(tasks);
  } catch (err) {
    appError.textContent = err.message;
    appError.classList.remove('hidden');
  }
}

function renderTasks(tasks) {
  taskList.textContent = '';
  emptyMsg.classList.toggle('hidden', tasks.length > 0);
  const today = new Date().toISOString().slice(0, 10);

  tasks.forEach((task) => {
    const overdue = !task.done && task.dueDate && task.dueDate < today;

    const li = document.createElement('li');
    li.className = 'task-item';
    if (task.done) li.classList.add('done');
    if (overdue) li.classList.add('overdue');

    const top = document.createElement('div');
    top.className = 'task-top';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.done;
    checkbox.ariaLabel = 'Toggle done';
    checkbox.addEventListener('change', async () => {
      await request('/api/tasks/' + task.id, {
        method: 'PATCH',
        body: JSON.stringify({ done: !task.done })
      });
      loadTasks();
    });

    const info = document.createElement('div');
    info.className = 'task-info';

    const title = document.createElement('p');
    title.className = 'task-title';
    title.textContent = task.title;
    info.appendChild(title);

    if (task.description) {
      const desc = document.createElement('p');
      desc.className = 'task-desc';
      desc.textContent = task.description;
      info.appendChild(desc);
    }

    const meta = document.createElement('div');
    meta.className = 'task-meta';
    meta.textContent = `Priority: ${task.priority}` + (task.dueDate ? ` | Due: ${task.dueDate}` : '');

    if (overdue) {
      const tag = document.createElement('span');
      tag.className = 'overdue-tag';
      tag.textContent = ' (OVERDUE)';
      meta.appendChild(tag);
    }

    info.appendChild(meta);
    top.appendChild(checkbox);
    top.appendChild(info);

    const buttons = document.createElement('div');
    buttons.className = 'task-buttons';

    const editBtn = document.createElement('button');
    editBtn.type = 'button';
    editBtn.className = 'pill-btn';
    editBtn.textContent = 'Edit';
    editBtn.addEventListener('click', async () => {
      const newTitle = prompt('Edit title:', task.title);
      if (newTitle === null) return;
      const newDesc = prompt('Edit description:', task.description);
      if (newDesc === null) return;
      const newDue = prompt('Edit due date (YYYY-MM-DD or leave blank):', task.dueDate || '');
      if (newDue === null) return;

      try {
        await request('/api/tasks/' + task.id, {
          method: 'PATCH',
          body: JSON.stringify({
            title: newTitle,
            description: newDesc,
            dueDate: newDue.trim() || null
          })
        });
        loadTasks();
      } catch (err) {
        appError.textContent = err.message;
        appError.classList.remove('hidden');
      }
    });

    const delBtn = document.createElement('button');
    delBtn.type = 'button';
    delBtn.className = 'danger';
    delBtn.textContent = 'Delete';
    delBtn.addEventListener('click', async () => {
      if (!confirm('Delete this task?')) return;
      await request('/api/tasks/' + task.id, { method: 'DELETE' });
      loadTasks();
    });

    buttons.appendChild(editBtn);
    buttons.appendChild(delBtn);

    li.appendChild(top);
    li.appendChild(buttons);
    taskList.appendChild(li);
  });
}

(async () => {
  if (!token) return;
  try {
    const user = await request('/api/auth/me');
    enterApp(user);
  } catch {
    logoutLocal();
  }
})();
