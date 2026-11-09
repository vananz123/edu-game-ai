CREATE TABLE IF NOT EXISTS lesson_documents (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  ext TEXT NOT NULL,
  size_bytes INTEGER NOT NULL,
  characters INTEGER NOT NULL,
  text_rel_path TEXT NOT NULL,
  sha256 TEXT,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lesson_analyses (
  id TEXT PRIMARY KEY,
  document_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  cache_key TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  FOREIGN KEY (document_id) REFERENCES lesson_documents(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS game_recommendations (
  id TEXT PRIMARY KEY,
  analysis_id TEXT NOT NULL,
  data_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  FOREIGN KEY (analysis_id) REFERENCES lesson_analyses(id) ON DELETE CASCADE
);
CREATE TABLE IF NOT EXISTS game_projects (
  id TEXT PRIMARY KEY,
  game_id TEXT,
  status TEXT NOT NULL,
  step TEXT NOT NULL,
  data_json TEXT NOT NULL,
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_game_projects_updated_at ON game_projects(updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_lesson_analyses_document ON lesson_analyses(document_id);
CREATE INDEX IF NOT EXISTS idx_game_recommendations_analysis ON game_recommendations(analysis_id);
CREATE TABLE IF NOT EXISTS lesson_chunks (
  document_id TEXT NOT NULL,
  chunk_index INTEGER NOT NULL,
  text TEXT NOT NULL,
  heading TEXT,
  char_start INTEGER NOT NULL,
  char_end INTEGER NOT NULL,
  token_count INTEGER NOT NULL DEFAULT 0,
  embedding BLOB,
  embedding_model TEXT,
  embedding_dim INTEGER,
  PRIMARY KEY (document_id, chunk_index),
  FOREIGN KEY (document_id) REFERENCES lesson_documents(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lesson_chunks_document ON lesson_chunks(document_id);
CREATE TABLE IF NOT EXISTS ai_generation_cache (
  cache_key TEXT PRIMARY KEY,
  kind TEXT NOT NULL,
  game_type TEXT,
  analysis_id TEXT,
  model_id TEXT NOT NULL,
  prompt_version TEXT NOT NULL,
  payload_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_ai_generation_cache_created ON ai_generation_cache(created_at DESC);
CREATE TABLE IF NOT EXISTS ai_tasks (
  task_id TEXT PRIMARY KEY,
  request_id TEXT NOT NULL,
  kind TEXT NOT NULL,
  project_id TEXT,
  document_id TEXT,
  label TEXT NOT NULL,
  state TEXT NOT NULL,
  progress TEXT NOT NULL DEFAULT 'running',
  error_code TEXT,
  error_message TEXT,
  result_summary TEXT,
  started_at TEXT NOT NULL,
  finished_at TEXT
);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_request ON ai_tasks(request_id);
CREATE INDEX IF NOT EXISTS idx_ai_tasks_started ON ai_tasks(started_at DESC);
CREATE TABLE IF NOT EXISTS lesson_chats (
  id TEXT PRIMARY KEY,
  title TEXT NOT NULL,
  document_ids TEXT NOT NULL,
  message_count INTEGER NOT NULL DEFAULT 0,
  last_intent TEXT NOT NULL DEFAULT '',
  schema_version INTEGER NOT NULL,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE TABLE IF NOT EXISTS lesson_chat_messages (
  id TEXT PRIMARY KEY,
  chat_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  role TEXT NOT NULL,
  text TEXT NOT NULL,
  intent TEXT NOT NULL,
  citations TEXT NOT NULL,
  question_set TEXT,
  provider_id TEXT NOT NULL DEFAULT '',
  error_code TEXT NOT NULL DEFAULT '',
  evidence_meta TEXT,
  created_at TEXT NOT NULL,
  UNIQUE (chat_id, position),
  FOREIGN KEY (chat_id) REFERENCES lesson_chats(id) ON DELETE CASCADE
);
CREATE INDEX IF NOT EXISTS idx_lesson_chat_messages_chat ON lesson_chat_messages(chat_id, position);
CREATE INDEX IF NOT EXISTS idx_lesson_chats_updated ON lesson_chats(updated_at DESC);
