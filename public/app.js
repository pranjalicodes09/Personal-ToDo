let token = localStorage.getItem('token') || '';
let isRegister = false;
let currentStatus = 'all';

const authSection = document.getElementById('auth-section');
const appSection = document.getElementById('app-section');
const userBar = document.getElementById('user-bar');
const userEmail = document.getElementById('user-email');
const authError = document.getElementById('auth-error');
const appError = document.getElementById('app-error');
const taskList = document.getElementById('task-list');
const emptyMsg = document.getElementById('empty-msg');

async function request(url, options = {}) {
  const headers = { 'Content-Type': 'application/json' };
  if (token) {
    headers.Authorization = 'Bearer ' + token;
  }

  const res = await fetch(url, { ...options, headers });

  if (res.status === 401 && url !== '/api/auth/login') {
    logoutLocal();
    throw new Error('Please log in again.');
  }

  if (res.status === 204) return null;

  const data = await res.json();
  if (!res.ok) {
    if (data.errors) {
      throw new Error(Object.values(data.errors).join(', '));
    }
    throw new Error(data.error || 'Something went wrong');
  }

  return data;
}

function logoutLocal() {
   token = '';
  localStorage.removeItem('token');
  authError.classList.add('hidden');
  authSection.classList.remove('hidden');
  appSection.classList.add('hidden');
  userBar.classList.add('hidden');

  const clearInputs = () => {
    document.getElementById('name').value = '';
    document.getElementById('email').value = '';
    document.getElementById('password').value = '';
  };
  clearInputs();
  setTimeout(clearInputs, 50);
}

function showApp(user) {
  userEmail.textContent = user.name ? `${user.name} (${user.email})` : user.email;
  authSection.classList.add('hidden');
  appSection.classList.remove('hidden');
  userBar.classList.remove('hidden');
  loadTasks();
}

// Switch between Login and Register
document.getElementById('show-login').addEventListener('click', () => {
  isRegister = false;
  document.getElementById('show-login').classList.add('active');
  document.getElementById('show-register').classList.remove('active');
  document.getElementById('name-row').classList.add('hidden');
  document.getElementById('auth-submit').textContent = 'Login';
  authError.classList.add('hidden');
});

document.getElementById('show-register').addEventListener('click', () => {
  isRegister = true;
  document.getElementById('show-register').classList.add('active');
  document.getElementById('show-login').classList.remove('active');
  document.getElementById('name-row').classList.remove('hidden');
  document.getElementById('auth-submit').textContent = 'Register';
  authError.classList.add('hidden');
});

// Submit Login / Register
document.getElementById('auth-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  authError.classList.add('hidden');

  const body = {
    email: document.getElementById('email').value,
    password: document.getElementById('password').value
  };
  if (isRegister) {
    body.name = document.getElementById('name').value;
  }

  const url = isRegister ? '/api/auth/register' : '/api/auth/login';

  try {
    const data = await request(url, {
      method: 'POST',
      body: JSON.stringify(body)
    });
    token = data.token;
    localStorage.setItem('token', token);
    document.getElementById('auth-form').reset();
    showApp(data.user);
  } catch (err) {
    authError.textContent = err.message;
    authError.classList.remove('hidden');
  }
});

// Logout
document.getElementById('logout-btn').addEventListener('click', async () => {
  try {
    await request('/api/auth/logout', { method: 'POST' });
  } catch (e) {}
  logoutLocal();
});

// Add Task
document.getElementById('task-form').addEventListener('submit', async (e) => {
  e.preventDefault();
  appError.classList.add('hidden');

  const body = {
    title: document.getElementById('title').value,
    description: document.getElementById('description').value,
    priority: document.getElementById('priority').value,
    dueDate: document.getElementById('due-date').value || null
  };

  try {
    await request('/api/tasks', {
      method: 'POST',
      body: JSON.stringify(body)
    });
    document.getElementById('task-form').reset();
    document.getElementById('priority').value = 'medium';
    loadTasks();
  } catch (err) {
    appError.textContent = err.message;
    appError.classList.remove('hidden');
  }
});

// Filters & Sort
document.querySelectorAll('.status-btn').forEach((btn) => {
  btn.addEventListener('click', () => {
    document.querySelectorAll('.status-btn').forEach((b) => b.classList.remove('active'));
    btn.classList.add('active');
    currentStatus = btn.dataset.status;
    loadTasks();
  });
});

document.getElementById('search').addEventListener('input', loadTasks);
document.getElementById('filter-priority').addEventListener('change', loadTasks);
document.getElementById('sort-by').addEventListener('change', loadTasks);

// Fetch and render tasks
async function loadTasks() {
  appError.classList.add('hidden');

  const q = document.getElementById('search').value.trim();
  const priority = document.getElementById('filter-priority').value;
  const [sort, order] = document.getElementById('sort-by').value.split(':');

  const params = new URLSearchParams({ status: currentStatus, sort, order });
  if (q) params.set('q', q);
  if (priority) params.set('priority', priority);

  try {
    const data = await request('/api/tasks?' + params.toString());
    renderTasks(data.tasks);
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
    const isOverdue = !task.completed && task.dueDate && task.dueDate < today;

    const li = document.createElement('li');
    li.className = 'task-item';
    if (task.completed) li.classList.add('done');
    if (isOverdue) li.classList.add('overdue');

    const top = document.createElement('div');
    top.className = 'task-top';

    const checkbox = document.createElement('input');
    checkbox.type = 'checkbox';
    checkbox.checked = task.completed;
    checkbox.ariaLabel = 'Toggle completed';
    checkbox.addEventListener('change', async () => {
      await request('/api/tasks/' + task.id, {
        method: 'PATCH',
        body: JSON.stringify({ completed: !task.completed })
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

    if (isOverdue) {
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

// Check existing session on page load
(async () => {
  if (!token) return;
  try {
    const data = await request('/api/auth/me');
    showApp(data.user);
  } catch (e) {
    logoutLocal();
  }
})();
