# Todo Tracker (Problem C2)

A personal task tracker with user registration, authentication, and per-user task management built with Node.js, Express, SQLite (`better-sqlite3`), and vanilla HTML/CSS/JS.

## Setup & Run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server (defaults to `http://localhost:3000` or `process.env.PORT`):
   ```bash
   npm start
   ```
   The SQLite database (`database/todo.db`) and its tables are created automatically on first startup.

## Run Tests

```bash
npm test
```

## Authentication & Security Notes

- **Password Hashing:** User passwords are never stored in plain text. They are hashed using `bcryptjs` (`10` salt rounds) before being saved in SQLite.
- **Session Tokens & Lifetime:** Logging in or registering issues a cryptographically random 256-bit hex token stored in a `sessions` table with a **24-hour expiration (`TOKEN_TTL_MS`)**. Each login creates a separate session row, so logging out revokes only the active session token (`POST /api/auth/logout`).
- **Browser Storage Trade-off:** The frontend stores the Bearer token in `localStorage` so sessions persist across page refreshes and are sent explicitly via `Authorization: Bearer <token>` (avoiding CSRF attacks that affect cookie-based auth). The trade-off is that `localStorage` is readable by JavaScript, making XSS protection critical—therefore all user-provided text is rendered exclusively using `textContent` rather than `innerHTML`.
- **Ownership Isolation:** Every task query filters by `user_id = req.user.id`. Accessing, updating, or deleting another user's task ID returns `404 Not Found` so task existence is never leaked.
