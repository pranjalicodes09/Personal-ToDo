# Personal Planner (Track C — Problem C2)

**Live App:** https://personal-todo-jh96.onrender.com/  
*(Note: Hosted on Render's free tier; the first visit after inactivity may take ~30–50 seconds to wake up, and the local SQLite file resets on service redeploy.)*

## About the Project

Personal Planner is a multi-user personal task tracker built for Track C (Problem C2). It provides a RESTful JSON API with token-based authentication and a phone-first single-page web interface where each user can securely create, organize, and track only their own tasks.

- **Multi-User Authentication:** Supports user registration, login, current-user lookup, and single-session logout using salted `bcryptjs` password hashes and expiring Bearer tokens.
- **Private Task Management:** Each user has isolated access to create, list, view, partially update (`PATCH`), and delete tasks with title, description, priority (`low`, `medium`, `high`), due date (`YYYY-MM-DD`), and completion status.
- **Filtering, Search & Sorting:** Supports filtering by status (`all`, `open`, `done`) and priority, case-insensitive search (`q`) across title and description, and sorting by `createdAt`, `dueDate` (with `null` due dates placed last on ascending sort), and `priority`.
- **Phone-First Responsive UI:** Built with semantic HTML5, CSS3, and vanilla JavaScript (`360px` to `1280px` screens, `44px+` touch targets, overdue task highlighting, and XSS-safe DOM rendering).

## Application Flow

1. **Session Check & Auth Portal (`/`):** On load, the frontend reads `localStorage` for an existing token and calls `GET /api/auth/me`. Visitors without a valid token see the Login / Register portal.
2. **Registration & Login (`/api/auth/register`, `/api/auth/login`):** Validates email format (`x@y.z`, max 120 chars, stored lowercase) and password strength (`8–128` chars with at least one letter and one digit). Passwords are hashed with `bcryptjs` (`10` salt rounds), and login issues a random 256-bit hex token stored in the SQLite `sessions` table.
3. **Bearer Token Verification (`middleware/auth.js`):** Every `/api/tasks` request must send `Authorization: Bearer <token>`. The middleware checks that the token exists in `sessions` and has not expired, attaching `req.user` to the request (or returning `401` so the client redirects back to Login).
4. **Task CRUD & Ownership Isolation (`/api/tasks`):** Every database query scopes operations to `user_id = req.user.id`. Requesting, updating, or deleting another user's task ID returns `404 Not Found` so task existence is never disclosed.
5. **Logout (`/api/auth/logout`):** Deletes only the active token row from `sessions` (`204 No Content`), leaving any other active sessions unaffected, and clears the token from the browser.

## Setup & Run

1. Install dependencies:
   ```bash
   npm install
   ```
2. Start the server (listens on `process.env.PORT` or defaults to `3000`):
   ```bash
   npm start
   ```
   The SQLite database (`database/todo.db`) and tables (`users`, `sessions`, `tasks`) are created automatically on first startup.

## Running Tests

```bash
npm test
```

## Design Assumptions & Security Notes

- **Token Lifetime:** Session tokens expire after **24 hours** (`86400` seconds) and are revoked immediately upon `POST /api/auth/logout`.
- **Browser Token Storage & Trade-offs:** The token is stored in `localStorage` so sessions persist across page reloads and are sent explicitly via the `Authorization` header (which prevents CSRF attacks inherent to cookies). The security trade-off is that `localStorage` is accessible to JavaScript if an XSS vulnerability exists; to mitigate this, all user-supplied content is rendered exclusively via `document.createTextNode` / `textContent` rather than `innerHTML`.
