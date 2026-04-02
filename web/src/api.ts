const BASE = '/api';

// --- Interfaces ---

interface Config {
  llm: { endpoint: string; model: string; api_key: string; context_window: number };
  canvas: { domain: string };
  storage: { path: string; encryption: boolean };
  accessibility: { voice_input: boolean; voice_readback: boolean };
  grading_model: string;
  qa_model: string;
  setup_complete: boolean;
}

export interface TestResult {
  ok: boolean;
  error?: string;
  model?: string;
  latency_ms?: number;
  courses_count?: number;
}

interface ModelsResult {
  ok: boolean;
  models?: Array<{ id: string; name: string; owned_by: string }>;
  error?: string;
}

interface Course {
  id: string;
  name: string;
  term: string | null;
  student_count: number;
  synced_at: number;
}

interface Student {
  id: string;
  name: string;
  email: string | null;
  section: string | null;
  course_id: string;
}

interface AttendanceSession {
  id: string;
  course_id: string;
  date: string;
  notes: string | null;
  finalized: number;
  records?: AttendanceRecord[];
}

interface AttendanceRecord {
  id: string;
  student_id: string;
  status: string;
  note: string | null;
  student_name: string;
}

interface VoiceResult {
  actions_taken: Array<{ student_id?: string; name?: string; new_status?: string; action?: string; text?: string }>;
  unmatched: string[];
}

interface AttendanceAnalytics {
  sessions_count: number;
  session_dates: string[];
  course_attendance_rate: number;
  students: Array<{
    id: string;
    name: string;
    present: number;
    absent: number;
    late: number;
    excused: number;
    attendance_rate: number;
    current_streak: number;
  }>;
}

interface VaultAsset {
  id: string;
  name: string;
  type: string;
  course_id: string | null;
  encrypted: number;
  size_bytes: number;
  created_at: number;
}

interface Rubric {
  id: string;
  name: string;
  course_id: string | null;
  criteria?: RubricCriterion[];
}

interface RubricCriterion {
  id: string;
  title: string;
  description: string | null;
  points_possible: number;
}

interface GradingSession {
  id: string;
  assignment_id: string;
  status: string;
  assignment?: Assignment;
  rubric?: Rubric;
  criteria?: RubricCriterion[];
}

interface Assignment {
  id: string;
  name: string;
  course_id: string;
  rubric_id: string | null;
  points_possible: number | null;
}

interface QueueItem extends Student {
  grading_status: string;
  items_total: number;
  items_approved: number;
}

interface GradeItem {
  id: string;
  session_id: string;
  student_id: string;
  criterion_id: string;
  suggested_score: number | null;
  suggested_comment: string | null;
  suggested_passage: string | null;
  professor_score: number | null;
  professor_comment: string | null;
  final_score: number | null;
  final_comment: string | null;
  status: string;
  criterion_title: string;
  criterion_description: string | null;
  points_possible: number;
}

interface AssistantResponse {
  draft: string;
  source: string;
  confidence: string;
  model: string;
}

interface AuditEntry {
  id: string;
  action: string;
  entity_type: string;
  entity_id: string;
  detail: string;
  created_at: number;
}

interface SyncResult {
  error?: string;
  courses_synced?: number;
  students_synced?: number;
  courses_cached?: number;
}

// --- Request helper ---

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    if (res.status === 401) {
      const err = new Error('Authentication required');
      (err as { status?: number }).status = 401;
      throw err;
    }
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

// --- API ---

export const api = {
  getConfig: () => request<Config>('/config'),
  saveConfig: (data: Record<string, string>) => request<{ updated: string[] }>('/config', { method: 'PUT', body: JSON.stringify(data) }),
  testLLM: () => request<TestResult>('/config/test-llm', { method: 'POST' }),
  testCanvas: () => request<TestResult>('/config/test-canvas', { method: 'POST' }),
  getModels: () => request<ModelsResult>('/config/models'),
  // Canvas sync
  syncCanvas: () => request<SyncResult>('/canvas/sync', { method: 'POST' }),
  getCourses: () => request<Course[]>('/courses'),
  getCourse: (id: string) => request<Course>(`/courses/${id}`),
  getStudents: (courseId: string) => request<Student[]>(`/courses/${courseId}/students`),
  // Attendance
  createAttendanceSession: (data: { course_id: string | undefined; date: string; notes?: string }) => request<AttendanceSession>('/attendance/sessions', { method: 'POST', body: JSON.stringify(data) }),
  getAttendanceSession: (id: string) => request<AttendanceSession>(`/attendance/sessions/${id}`),
  getAttendanceSessions: (params: string) => request<AttendanceSession[]>(`/attendance/sessions?${params}`),
  updateAttendanceRecord: (id: string, data: { status: string; note?: string; source?: string }) => request<AttendanceRecord>(`/attendance/records/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  finalizeAttendance: (id: string) => request<{ finalized: boolean }>(`/attendance/sessions/${id}/finalize`, { method: 'POST' }),
  exportAttendance: (id: string) => `${BASE}/attendance/sessions/${id}/export`,
  processVoiceCommand: (sessionId: string, command: string) => request<VoiceResult>(`/attendance/sessions/${sessionId}/voice`, { method: 'POST', body: JSON.stringify({ command }) }),
  getAttendanceAnalytics: (courseId: string) => request<AttendanceAnalytics>(`/attendance/analytics/${courseId}`),
  // Vault
  getVaultAssets: (courseId?: string) => request<VaultAsset[]>(`/vault/assets${courseId ? `?course_id=${courseId}` : ''}`),
  deleteVaultAsset: (id: string) => request<{ deleted: boolean }>(`/vault/assets/${id}`, { method: 'DELETE' }),
  downloadVaultAsset: (id: string) => `${BASE}/vault/assets/${id}/download`,
  // Grading
  createRubric: (data: { name: string; course_id?: string; criteria: Array<{ title: string; description?: string; points_possible: number }> }) => request<Rubric>('/rubrics', { method: 'POST', body: JSON.stringify(data) }),
  getRubric: (id: string) => request<Rubric>(`/rubrics/${id}`),
  getRubrics: (courseId?: string) => request<Rubric[]>(`/rubrics${courseId ? `?course_id=${courseId}` : ''}`),
  createGradingSession: (data: { assignment_id: string; rubric_id?: string }) => request<GradingSession>('/grading/sessions', { method: 'POST', body: JSON.stringify(data) }),
  getGradingSession: (id: string) => request<GradingSession>(`/grading/sessions/${id}`),
  getGradingQueue: (id: string) => request<QueueItem[]>(`/grading/sessions/${id}/queue`),
  requestSuggestion: (sessionId: string, studentId: string, data: { submission_text: string }) => request<GradeItem[]>(`/grading/sessions/${sessionId}/suggest/${studentId}`, { method: 'POST', body: JSON.stringify(data) }),
  getGradeItems: (sessionId: string, studentId: string) => request<GradeItem[]>(`/grading/items?session_id=${sessionId}&student_id=${studentId}`),
  updateGradeItem: (id: string, data: { professor_score?: number; professor_comment?: string }) => request<GradeItem>(`/grading/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  approveGradeItem: (id: string) => request<GradeItem>(`/grading/items/${id}/approve`, { method: 'POST' }),
  exportGrades: (id: string) => `${BASE}/grading/sessions/${id}/export`,
  exportCourseGrades: (courseId: string) => `${BASE}/grading/export/course/${courseId}`,
  // Q&A
  askAssistant: (data: { question: string; course_id: string | null; document_contents: Array<{ id: string; name: string; text: string }> }) => request<AssistantResponse>('/assistant/answer', { method: 'POST', body: JSON.stringify(data) }),
  // Audit
  getAuditLog: (params: string) => request<AuditEntry[]>(`/audit?${params}`),
};

export type { Config, Course, Student, AttendanceSession, AttendanceRecord, VoiceResult, AttendanceAnalytics, VaultAsset, Rubric, GradingSession, Assignment, QueueItem, GradeItem, AssistantResponse, AuditEntry };
