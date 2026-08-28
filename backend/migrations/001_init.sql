-- 001_init.sql 全量建表 + 内置种子（标签/科目/学期）

CREATE TABLE IF NOT EXISTS migrations (
  name TEXT PRIMARY KEY,
  applied_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  pin_hash TEXT,
  display_name TEXT,
  failed_attempts INTEGER DEFAULT 0,
  locked_until TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT
);

CREATE TABLE IF NOT EXISTS terms (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL UNIQUE,
  start_date TEXT,
  end_date TEXT,
  grade INTEGER
);

CREATE TABLE IF NOT EXISTS subjects (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  code TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  full_score REAL NOT NULL,
  grade_start INTEGER DEFAULT 1,
  sort INTEGER DEFAULT 0,
  enabled INTEGER DEFAULT 1,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_no TEXT NOT NULL UNIQUE,
  name TEXT NOT NULL,
  gender INTEGER,
  birth_date TEXT,
  photo_path TEXT,
  ethnicity TEXT,
  address TEXT,
  residence TEXT,
  enrolled_at TEXT,
  status TEXT DEFAULT '在读',
  board_type TEXT,
  cadre_role TEXT,
  focus_level INTEGER DEFAULT 0,
  remark TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS student_sensitive (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  category TEXT NOT NULL,
  content_encrypted BLOB NOT NULL,
  iv BLOB NOT NULL,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  action TEXT NOT NULL,
  target_student_id INTEGER,
  detail TEXT,
  created_at TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS tags (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  domain TEXT NOT NULL,
  name TEXT NOT NULL,
  color TEXT,
  sensitive_level INTEGER DEFAULT 0,
  is_builtin INTEGER DEFAULT 0,
  deleted_at TEXT,
  UNIQUE(domain, name)
);

CREATE TABLE IF NOT EXISTS student_tags (
  student_id INTEGER NOT NULL REFERENCES students(id),
  tag_id INTEGER NOT NULL REFERENCES tags(id),
  PRIMARY KEY (student_id, tag_id)
);

CREATE TABLE IF NOT EXISTS guardians (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  relation TEXT,
  name TEXT,
  phone TEXT,
  wechat TEXT,
  job TEXT,
  contact_pref TEXT,
  best_time TEXT,
  is_primary INTEGER DEFAULT 0,
  remark TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS exams (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  name TEXT NOT NULL,
  exam_type TEXT,
  term_id INTEGER REFERENCES terms(id),
  exam_date TEXT,
  subject_ids TEXT NOT NULL,
  grade_ref TEXT,
  status TEXT DEFAULT '未录入',
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS scores (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  exam_id INTEGER NOT NULL REFERENCES exams(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  subject_id INTEGER NOT NULL REFERENCES subjects(id),
  score REAL,
  status TEXT DEFAULT '正常',
  class_rank INTEGER,
  UNIQUE (exam_id, student_id, subject_id)
);

CREATE INDEX IF NOT EXISTS idx_scores_student ON scores(student_id);
CREATE INDEX IF NOT EXISTS idx_scores_exam ON scores(exam_id);

CREATE TABLE IF NOT EXISTS incidents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  occurred_at TEXT NOT NULL,
  category TEXT NOT NULL,
  severity INTEGER DEFAULT 1,
  title TEXT,
  content TEXT,
  draft_content TEXT,
  ai_suggestion TEXT,
  status TEXT DEFAULT 'draft',
  follow_up_needed INTEGER DEFAULT 0,
  follow_up_deadline TEXT,
  follow_up_done_at TEXT,
  created_at TEXT NOT NULL,
  updated_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS incident_students (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER NOT NULL REFERENCES incidents(id),
  student_id INTEGER NOT NULL REFERENCES students(id),
  is_primary INTEGER DEFAULT 1,
  role_note TEXT
);

CREATE TABLE IF NOT EXISTS attachments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  incident_id INTEGER REFERENCES incidents(id),
  file_path TEXT NOT NULL,
  thumb_path TEXT,
  mime TEXT,
  size INTEGER,
  sha1 TEXT,
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS kb_documents (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  title TEXT NOT NULL,
  category_path TEXT,
  source TEXT,
  file_path TEXT,
  content_text TEXT,
  seg_count INTEGER DEFAULT 0,
  created_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS kb_segments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  document_id INTEGER NOT NULL REFERENCES kb_documents(id),
  seq INTEGER NOT NULL,
  text TEXT NOT NULL,
  tokenized_text TEXT NOT NULL,
  embedding TEXT
);

CREATE VIRTUAL TABLE IF NOT EXISTS kb_segments_fts USING fts5(
  tokenized_text, text UNINDEXED, segment_id UNINDEXED
);

CREATE TABLE IF NOT EXISTS ai_prompts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene TEXT NOT NULL,
  name TEXT NOT NULL,
  template TEXT NOT NULL,
  style_params TEXT,
  is_builtin INTEGER DEFAULT 0,
  is_default INTEGER DEFAULT 0,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS ai_records (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  scene TEXT NOT NULL,
  prompt_id INTEGER,
  student_id INTEGER,
  context_snapshot TEXT,
  output_text TEXT,
  model TEXT,
  tokens_in INTEGER,
  tokens_out INTEGER,
  status TEXT DEFAULT 'generated',
  created_at TEXT
);

CREATE TABLE IF NOT EXISTS comments (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL REFERENCES students(id),
  term_id INTEGER REFERENCES terms(id),
  comment_type TEXT,
  final_text TEXT NOT NULL,
  source_ai_record_id INTEGER,
  created_at TEXT,
  deleted_at TEXT
);

CREATE TABLE IF NOT EXISTS settings (
  key TEXT PRIMARY KEY,
  value TEXT
);

-- 内置学期
INSERT OR IGNORE INTO terms (id, name, start_date, end_date, grade) VALUES
  (1, '2026-2027 第一学期', '2026-09-01', '2027-01-20', 1),
  (2, '2026-2027 第二学期', '2027-02-20', '2027-07-10', 1);

-- 内置科目（初一）
INSERT OR IGNORE INTO subjects (id, code, name, full_score, grade_start, sort, enabled) VALUES
  (1, 'yu', '语文', 120, 1, 1, 1),
  (2, 'shu', '数学', 120, 1, 2, 1),
  (3, 'wai', '英语', 120, 1, 3, 1),
  (4, 'df', '道法', 100, 1, 4, 1),
  (5, 'ls', '历史', 100, 1, 5, 1),
  (6, 'dl', '地理', 100, 1, 6, 1),
  (7, 'sw', '生物', 100, 1, 7, 1),
  (8, 'ty', '体育', 100, 1, 8, 1);

-- 内置标签（附录 B）
INSERT OR IGNORE INTO tags (domain, name, sensitive_level, is_builtin) VALUES
  ('学业', '偏科', 0, 1),
  ('学业', '作业拖拉', 0, 1),
  ('学业', '进步快', 0, 1),
  ('学业', '需要基础辅导', 0, 1),
  ('行为情绪', '情绪易波动', 1, 1),
  ('行为情绪', '易冲突', 1, 1),
  ('行为情绪', '注意力难集中', 1, 1),
  ('行为情绪', '自我管理弱', 0, 1),
  ('健康', '视力问题', 0, 1),
  ('健康', '体育锻炼受限', 0, 1),
  ('健康', '慢性疾病', 2, 1),
  ('家庭', '父母离异', 1, 1),
  ('家庭', '单亲', 1, 1),
  ('家庭', '留守儿童', 1, 1),
  ('家庭', '经济困难', 1, 1),
  ('家庭', '隔代抚养', 1, 1),
  ('家庭', '家中有变故', 2, 1),
  ('特长', '体育', 0, 1),
  ('特长', '文艺', 0, 1),
  ('特长', '动手能力强', 0, 1);

INSERT OR IGNORE INTO settings (key, value) VALUES
  ('low_score_ratio', '0.4'),
  ('pass_ratio', '0.6'),
  ('excellent_ratio', '0.85'),
  ('rank_jump_threshold', '8');
