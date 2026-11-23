//Importing and connecting database
const path = require('path');
const Database = require('better-sqlite3');
const dbPath = process.env.DB_PATH || path.join(__dirname, 'todo.db');
const db = new Database(dbPath);

//Configuring Database Settings
db.pragma('journal_mode = WAL'); //Write Ahead Logging
db.pragma('foreign_keys = ON');  //Verfies the real user_id

//Creating Schemas
          // exec - execute mult SQL statements 
          // 1.Users; 2.Sessions; 3.Tasks; 4.Indexes
  
  db.exec(`
  CREATE TABLE IF NOT EXISTS users (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    email TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name TEXT,
    created_at TEXT NOT NULL
  );

  CREATE TABLE IF NOT EXISTS sessions (
    token TEXT PRIMARY KEY,
    user_id INTEGER NOT NULL,
    expires_at TEXT NOT NULL,
    created_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    user_id INTEGER NOT NULL,
    title TEXT NOT NULL,
    description TEXT NOT NULL DEFAULT '',
    completed INTEGER NOT NULL DEFAULT 0,
    priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low', 'medium', 'high')),
    due_date TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_user_id ON tasks(user_id);
  CREATE INDEX IF NOT EXISTS idx_sessions_user_id ON sessions(user_id);
`);//last two lines are for speeding up quaries and session management

module.exports = db;
//shared single db for all to reuse the same database connection across the application