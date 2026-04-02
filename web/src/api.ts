const BASE = '/api';

async function request<T>(path: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    headers: { 'Content-Type': 'application/json', ...options?.headers },
    ...options,
  });
  if (!res.ok) {
    if (res.status === 401) {
      const err = new Error('Authentication required');
      (err as any).status = 401;
      throw err;
    }
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error || `Request failed: ${res.status}`);
  }
  return res.json();
}

export const api = {
  getConfig: () => request<any>('/config'),
  saveConfig: (data: Record<string, string>) => request<any>('/config', { method: 'PUT', body: JSON.stringify(data) }),
  testLLM: () => request<any>('/config/test-llm', { method: 'POST' }),
  testCanvas: () => request<any>('/config/test-canvas', { method: 'POST' }),
  getModels: () => request<any>('/config/models'),
  // Canvas sync
  syncCanvas: () => request<any>('/canvas/sync', { method: 'POST' }),
  getCourses: () => request<any[]>('/courses'),
  getCourse: (id: string) => request<any>(`/courses/${id}`),
  getStudents: (courseId: string) => request<any[]>(`/courses/${courseId}/students`),
  // Attendance
  createAttendanceSession: (data: any) => request<any>('/attendance/sessions', { method: 'POST', body: JSON.stringify(data) }),
  getAttendanceSession: (id: string) => request<any>(`/attendance/sessions/${id}`),
  getAttendanceSessions: (params: string) => request<any[]>(`/attendance/sessions?${params}`),
  updateAttendanceRecord: (id: string, data: any) => request<any>(`/attendance/records/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  finalizeAttendance: (id: string) => request<any>(`/attendance/sessions/${id}/finalize`, { method: 'POST' }),
  exportAttendance: (id: string) => `${BASE}/attendance/sessions/${id}/export`,
  processVoiceCommand: (sessionId: string, command: string) => request<any>(`/attendance/sessions/${sessionId}/voice`, { method: 'POST', body: JSON.stringify({ command }) }),
  getAttendanceAnalytics: (courseId: string) => request<any>(`/attendance/analytics/${courseId}`),
  // Vault
  getVaultAssets: (courseId?: string) => request<any[]>(`/vault/assets${courseId ? `?course_id=${courseId}` : ''}`),
  deleteVaultAsset: (id: string) => request<any>(`/vault/assets/${id}`, { method: 'DELETE' }),
  downloadVaultAsset: (id: string) => `${BASE}/vault/assets/${id}/download`,
  // Grading
  createRubric: (data: any) => request<any>('/rubrics', { method: 'POST', body: JSON.stringify(data) }),
  getRubric: (id: string) => request<any>(`/rubrics/${id}`),
  getRubrics: (courseId?: string) => request<any[]>(`/rubrics${courseId ? `?course_id=${courseId}` : ''}`),
  createGradingSession: (data: any) => request<any>('/grading/sessions', { method: 'POST', body: JSON.stringify(data) }),
  getGradingSession: (id: string) => request<any>(`/grading/sessions/${id}`),
  getGradingQueue: (id: string) => request<any[]>(`/grading/sessions/${id}/queue`),
  requestSuggestion: (sessionId: string, studentId: string, data: any) => request<any>(`/grading/sessions/${sessionId}/suggest/${studentId}`, { method: 'POST', body: JSON.stringify(data) }),
  getGradeItems: (sessionId: string, studentId: string) => request<any[]>(`/grading/items?session_id=${sessionId}&student_id=${studentId}`),
  updateGradeItem: (id: string, data: any) => request<any>(`/grading/items/${id}`, { method: 'PUT', body: JSON.stringify(data) }),
  approveGradeItem: (id: string) => request<any>(`/grading/items/${id}/approve`, { method: 'POST' }),
  exportGrades: (id: string) => `${BASE}/grading/sessions/${id}/export`,
  exportCourseGrades: (courseId: string) => `${BASE}/grading/export/course/${courseId}`,
  // Q&A
  askAssistant: (data: any) => request<any>('/assistant/answer', { method: 'POST', body: JSON.stringify(data) }),
  // Audit
  getAuditLog: (params: string) => request<any[]>(`/audit?${params}`),
};
