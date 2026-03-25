-- MyTA Personal — Initial Schema
-- Single-user teaching assistant app

-- Users (just you — one row forever)
CREATE TABLE user (
  id TEXT PRIMARY KEY DEFAULT 'me',
  canvas_token_encrypted TEXT,
  canvas_domain TEXT,
  created_at INTEGER NOT NULL
);

-- Canvas courses synced from API
CREATE TABLE course (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  term TEXT,
  section_count INTEGER DEFAULT 1,
  synced_at INTEGER NOT NULL
);

-- Students (roster per course)
CREATE TABLE student (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(id),
  name TEXT NOT NULL,
  email TEXT,
  canvas_section TEXT,
  UNIQUE(id, course_id)
);

-- Attendance sessions
CREATE TABLE attendance_session (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(id),
  date TEXT NOT NULL,
  notes TEXT,
  finalized INTEGER DEFAULT 0,
  created_at INTEGER NOT NULL
);

-- Individual attendance records
CREATE TABLE attendance_record (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES attendance_session(id),
  student_id TEXT NOT NULL,
  status TEXT NOT NULL,
  note TEXT,
  source TEXT DEFAULT 'manual',
  ocr_confidence TEXT,
  override INTEGER DEFAULT 0,
  updated_at INTEGER NOT NULL
);

-- Assignments (from Canvas or manual)
CREATE TABLE assignment (
  id TEXT PRIMARY KEY,
  course_id TEXT NOT NULL REFERENCES course(id),
  name TEXT NOT NULL,
  canvas_assignment_id TEXT,
  points_possible REAL,
  rubric_id TEXT REFERENCES rubric(id),
  created_at INTEGER NOT NULL
);

-- Rubrics
CREATE TABLE rubric (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  assignment_id TEXT,
  created_at INTEGER NOT NULL
);

-- Rubric criteria
CREATE TABLE rubric_criterion (
  id TEXT PRIMARY KEY,
  rubric_id TEXT NOT NULL REFERENCES rubric(id),
  title TEXT NOT NULL,
  description TEXT,
  points_possible REAL NOT NULL,
  sort_order INTEGER DEFAULT 0
);

-- Grading sessions (one per assignment)
CREATE TABLE grading_session (
  id TEXT PRIMARY KEY,
  assignment_id TEXT NOT NULL REFERENCES assignment(id),
  status TEXT DEFAULT 'active',
  created_at INTEGER NOT NULL
);

-- Per-student per-criterion suggestions and decisions
CREATE TABLE grade_item (
  id TEXT PRIMARY KEY,
  session_id TEXT NOT NULL REFERENCES grading_session(id),
  student_id TEXT NOT NULL,
  criterion_id TEXT NOT NULL REFERENCES rubric_criterion(id),
  suggested_score REAL,
  suggested_comment TEXT,
  professor_score REAL,
  professor_comment TEXT,
  final_score REAL,
  final_comment TEXT,
  status TEXT DEFAULT 'pending',
  ai_model TEXT,
  ai_provider TEXT,
  provenance_vault_asset_id TEXT,
  updated_at INTEGER NOT NULL
);

-- Vault assets (metadata only — files in R2)
CREATE TABLE vault_asset (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  type TEXT NOT NULL,
  course_id TEXT REFERENCES course(id),
  r2_key TEXT NOT NULL,
  size_bytes INTEGER,
  encrypted INTEGER DEFAULT 1,
  created_at INTEGER NOT NULL
);

-- Audit log (append-only)
CREATE TABLE audit_log (
  id TEXT PRIMARY KEY,
  action TEXT NOT NULL,
  entity_type TEXT,
  entity_id TEXT,
  detail TEXT,
  created_at INTEGER NOT NULL
);
