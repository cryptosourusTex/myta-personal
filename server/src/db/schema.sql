-- MyTA Personal — Complete Database Schema
-- SQLite. One file. Run on startup if tables don't exist.

-- Server configuration (one row per key)
CREATE TABLE IF NOT EXISTS config (
  key   TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

-- Canvas courses synced from API
CREATE TABLE IF NOT EXISTS course (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  term        TEXT,
  canvas_url  TEXT,
  synced_at   INTEGER NOT NULL
);

-- Students per course
CREATE TABLE IF NOT EXISTS student (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES course(id),
  name        TEXT NOT NULL,
  email       TEXT,
  section     TEXT,
  UNIQUE(id, course_id)
);

-- Attendance sessions
CREATE TABLE IF NOT EXISTS attendance_session (
  id          TEXT PRIMARY KEY,
  course_id   TEXT NOT NULL REFERENCES course(id),
  date        TEXT NOT NULL,
  notes       TEXT,
  finalized   INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL
);

-- Attendance records
CREATE TABLE IF NOT EXISTS attendance_record (
  id            TEXT PRIMARY KEY,
  session_id    TEXT NOT NULL REFERENCES attendance_session(id),
  student_id    TEXT NOT NULL,
  status        TEXT NOT NULL,
  note          TEXT,
  source        TEXT DEFAULT 'manual',
  ocr_confidence TEXT,
  updated_at    INTEGER NOT NULL
);

-- Rubrics
CREATE TABLE IF NOT EXISTS rubric (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  course_id   TEXT REFERENCES course(id),
  created_at  INTEGER NOT NULL
);

-- Rubric criteria
CREATE TABLE IF NOT EXISTS rubric_criterion (
  id              TEXT PRIMARY KEY,
  rubric_id       TEXT NOT NULL REFERENCES rubric(id),
  title           TEXT NOT NULL,
  description     TEXT,
  points_possible REAL NOT NULL,
  sort_order      INTEGER DEFAULT 0
);

-- Assignments
CREATE TABLE IF NOT EXISTS assignment (
  id                  TEXT PRIMARY KEY,
  course_id           TEXT NOT NULL REFERENCES course(id),
  name                TEXT NOT NULL,
  canvas_assignment_id TEXT,
  points_possible     REAL,
  rubric_id           TEXT REFERENCES rubric(id),
  created_at          INTEGER NOT NULL
);

-- Grading sessions
CREATE TABLE IF NOT EXISTS grading_session (
  id            TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignment(id),
  status        TEXT DEFAULT 'active',
  created_at    INTEGER NOT NULL
);

-- Per-student per-criterion grade items
-- Three-way separation is mandatory: suggested / professor / final
CREATE TABLE IF NOT EXISTS grade_item (
  id                      TEXT PRIMARY KEY,
  session_id              TEXT NOT NULL REFERENCES grading_session(id),
  student_id              TEXT NOT NULL,
  criterion_id            TEXT NOT NULL REFERENCES rubric_criterion(id),

  -- AI suggestion (read-only after creation)
  suggested_score         REAL,
  suggested_comment       TEXT,
  suggested_passage       TEXT,
  ai_model                TEXT,
  ai_endpoint             TEXT,

  -- Professor values (editable)
  professor_score         REAL,
  professor_comment       TEXT,

  -- Final (written only on explicit approve action)
  final_score             REAL,
  final_comment           TEXT,

  status  TEXT DEFAULT 'pending',
  input_method TEXT DEFAULT 'keyboard',
  updated_at   INTEGER NOT NULL,
  UNIQUE(session_id, student_id, criterion_id)
);

-- Vault assets (metadata — files stored separately)
CREATE TABLE IF NOT EXISTS vault_asset (
  id          TEXT PRIMARY KEY,
  name        TEXT NOT NULL,
  type        TEXT NOT NULL,
  course_id   TEXT REFERENCES course(id),
  file_path   TEXT NOT NULL,
  size_bytes  INTEGER,
  encrypted   INTEGER DEFAULT 0,
  created_at  INTEGER NOT NULL
);

-- Append-only audit log
CREATE TABLE IF NOT EXISTS audit_log (
  id          TEXT PRIMARY KEY,
  action      TEXT NOT NULL,
  entity_type TEXT,
  entity_id   TEXT,
  detail      TEXT,
  input_method TEXT,
  created_at  INTEGER NOT NULL
);
