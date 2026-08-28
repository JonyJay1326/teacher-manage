-- 班主任对学生的主观印象（可编辑长文本，供 AI 学情/评语上下文注入）
CREATE TABLE IF NOT EXISTS student_impressions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  student_id INTEGER NOT NULL UNIQUE,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL,
  deleted_at TEXT,
  FOREIGN KEY (student_id) REFERENCES students(id)
);

CREATE INDEX IF NOT EXISTS idx_student_impressions_student
  ON student_impressions(student_id)
  WHERE deleted_at IS NULL;
