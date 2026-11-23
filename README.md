# Personal Planner (Track C — Problem C2)

**Live Demo:** [Personal Planner on Render](https://onrender.com) *(Note: Free tier may take 30–50s to wake up; SQLite resets on redeploy).*

---

## ✨ Overview
A multi-user task tracker built with **Node.js, Express, SQLite, and Vanilla JavaScript**. Offers private workspaces with full CRUD operations, live status metrics, search/filtering, and rock-solid security.

## 🚀 Key Features
* **Auth & Security:** Registration, login, profile view (`/me`), logout, password changing, `bcryptjs` hashing (10 salt rounds), and 24-hour Bearer token sessions.
* **Task Management:** Create, edit, toggle completion, and delete tasks with priority (`low`, `medium`, `high`) and due dates. Strictly scoped to each owner.
* **Task Summary Bar:** Live dashboard counters tracking **Open**, **Overdue**, and **Completed** tasks.
* **Search, Filter & Sort:** Filter by status or priority, keyword search, and sorting by date or priority.
* **Responsive UI:** Mobile-first design (360px–1280px), large touch targets, and XSS-safe `textContent` rendering.

## 🛠️ Tech Stack
* **Backend:** Node.js, Express
* **Database:** SQLite (`better-sqlite3`)
* **Auth:** `bcryptjs`, 256-bit crypto tokens
* **Frontend:** Semantic HTML5, CSS3, Vanilla JS

## 📡 API Reference

### Auth (`/api/auth`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :---: | :--- |
| `POST` | `/api/auth/register` | No | Register new user |
| `POST` | `/api/auth/login` | No | Login for session token |
| `GET` | `/api/auth/me` | Yes | Get active user profile |
| `POST` | `/api/auth/change-password` | Yes | Update password |
| `POST` | `/api/auth/logout` | Yes | Revoke session token |

### Tasks (`/api/tasks`)

| Method | Endpoint | Auth | Description |
| :--- | :--- | :---: | :--- |
| `GET` | `/api/tasks` | Yes | List/filter user tasks |
| `POST` | `/api/tasks` | Yes | Create a new task |
| `GET` | `/api/tasks/:id` | Yes | Get task by ID |
| `PATCH` | `/api/tasks/:id` | Yes | Update task or status |
| `DELETE` | `/api/tasks/:id` | Yes | Delete task |

## ⚡ Quick Start
1. **Install dependencies:** `npm install`
2. **Start server:** `npm start` *(Runs on `http://localhost:3000`)*
3. **Run tests:** `npm test`

---
*Built with LocalStorage bearer token architecture and DOM sanitization to mitigate CSRF and XSS risks.*
