CREATE TABLE IF NOT EXISTS games (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  subject TEXT DEFAULT '',
  grade TEXT DEFAULT '',
  topic TEXT DEFAULT '',
  template TEXT DEFAULT 'quiz',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS sessions (
  id TEXT PRIMARY KEY,
  created_at TEXT NOT NULL,
  data_json TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_games_updated_at ON games(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_sessions_created_at ON sessions(created_at DESC);
