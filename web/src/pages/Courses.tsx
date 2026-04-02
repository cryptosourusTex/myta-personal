import { useState, useEffect } from 'react';
import { Routes, Route, Link, useParams, useNavigate } from 'react-router-dom';
import { api } from '../api';

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
}

function CourseList() {
  const [courses, setCourses] = useState<Course[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [newName, setNewName] = useState('');

  const load = () => api.getCourses().then(setCourses).catch(() => {});
  useEffect(() => { load(); }, []);

  const sync = async () => {
    setSyncing(true);
    setSyncResult('');
    try {
      const result = await api.syncCanvas();
      if (result.error) {
        setSyncResult(`Offline — ${result.courses_cached} cached courses`);
      } else {
        setSyncResult(`Synced ${result.courses_synced} courses, ${result.students_synced} students`);
      }
      load();
    } catch (err: any) {
      setSyncResult(`Error: ${err.message}`);
    }
    setSyncing(false);
  };

  const addCourse = async () => {
    if (!newName.trim()) return;
    await fetch('/api/courses', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newName }) });
    setNewName('');
    setShowAdd(false);
    load();
  };

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Courses</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <button onClick={sync} disabled={syncing} className="btn btn-primary btn-small">{syncing ? 'Syncing...' : 'Sync Canvas'}</button>
          <button onClick={() => setShowAdd(!showAdd)} className="btn btn-secondary btn-small">Add Course</button>
        </div>
      </div>

      {syncResult && <div className={`status-msg ${syncResult.includes('Error') ? 'error' : 'success'}`} style={{ marginBottom: '1rem' }}>{syncResult}</div>}

      {showAdd && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input type="text" value={newName} onChange={(e) => setNewName(e.target.value)} placeholder="Course name" style={{ flex: 1 }} />
          <button onClick={addCourse} className="btn btn-primary btn-small">Add</button>
        </div>
      )}

      {courses.length === 0 ? (
        <p style={{ color: '#737373' }}>No courses yet. Sync from Canvas or add manually.</p>
      ) : (
        <div className="course-list">
          {courses.map((course) => (
            <Link key={course.id} to={`/courses/${course.id}`} className="course-card">
              <div className="course-name">{course.name}</div>
              <div className="course-meta">{course.student_count} students</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}

function CourseDetail() {
  const { courseId } = useParams();
  const [course, setCourse] = useState<any>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [showAddStudent, setShowAddStudent] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const navigate = useNavigate();

  useEffect(() => {
    if (!courseId) return;
    api.getCourse(courseId).then(setCourse).catch(() => {});
    api.getStudents(courseId).then(setStudents).catch(() => {});
  }, [courseId]);

  const addStudent = async () => {
    if (!newStudentName.trim() || !courseId) return;
    await fetch(`/api/courses/${courseId}/students`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: newStudentName }) });
    setNewStudentName('');
    setShowAddStudent(false);
    api.getStudents(courseId).then(setStudents);
  };

  if (!course) return <div className="loading">Loading...</div>;

  return (
    <div className="page">
      <Link to="/courses" style={{ color: '#1F3864', fontSize: '0.875rem' }}>Back to courses</Link>
      <h1 style={{ marginTop: '0.5rem' }}>{course.name}</h1>

      <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
        <button onClick={() => navigate(`/courses/${courseId}/attendance`)} className="btn btn-primary btn-small">Attendance</button>
        <button onClick={() => navigate(`/courses/${courseId}/grading`)} className="btn btn-primary btn-small">Grading</button>
        <button onClick={() => setShowAddStudent(!showAddStudent)} className="btn btn-secondary btn-small">Add Student</button>
      </div>

      {showAddStudent && (
        <div style={{ display: 'flex', gap: '0.5rem', marginBottom: '1rem' }}>
          <input type="text" value={newStudentName} onChange={(e) => setNewStudentName(e.target.value)} placeholder="Student name" style={{ flex: 1 }} />
          <button onClick={addStudent} className="btn btn-primary btn-small">Add</button>
        </div>
      )}

      <h2 style={{ fontSize: '1rem', marginBottom: '0.5rem' }}>Roster ({students.length})</h2>
      {students.length === 0 ? (
        <p style={{ color: '#737373' }}>No students. Sync from Canvas or add manually.</p>
      ) : (
        <table className="vault-table">
          <thead><tr><th>Name</th><th>Email</th><th>Section</th></tr></thead>
          <tbody>
            {students.map((s) => (
              <tr key={s.id}><td>{s.name}</td><td>{s.email || '—'}</td><td>{s.section || '—'}</td></tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function Courses() {
  return (
    <Routes>
      <Route index element={<CourseList />} />
      <Route path=":courseId" element={<CourseDetail />} />
      <Route path=":courseId/attendance" element={<AttendancePage />} />
      <Route path=":courseId/grading" element={<GradingPage />} />
    </Routes>
  );
}

// ---- Attendance Page (inline to keep routing simple) ----

function AttendancePage() {
  const { courseId } = useParams();
  const [sessions, setSessions] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [recording, setRecording] = useState(false);
  const [voiceResult, setVoiceResult] = useState('');
  const [analytics, setAnalytics] = useState<any>(null);

  useEffect(() => {
    if (courseId) {
      loadSessions();
      api.getAttendanceAnalytics(courseId).then(setAnalytics).catch(() => {});
    }
  }, [courseId]);

  const loadSessions = () => {
    api.getAttendanceSessions(`course_id=${courseId}`).then(setSessions).catch(() => {});
  };

  const createSession = async () => {
    const date = new Date().toISOString().split('T')[0];
    const result = await api.createAttendanceSession({ course_id: courseId, date });
    loadSessions();
    loadSession(result.id);
  };

  const loadSession = async (id: string) => {
    const session = await api.getAttendanceSession(id);
    setActiveSession(session);
  };

  const cycleStatus = async (record: any) => {
    if (activeSession?.finalized) return;
    const order = ['absent', 'present', 'late', 'excused'];
    const next = order[(order.indexOf(record.status) + 1) % order.length];
    await api.updateAttendanceRecord(record.id, { status: next, source: 'manual' });
    loadSession(activeSession.id);
  };

  const finalize = async () => {
    if (!confirm('Finalize this attendance session? This locks the records.')) return;
    await api.finalizeAttendance(activeSession.id);
    loadSession(activeSession.id);
    loadSessions();
  };

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setVoiceResult('Speech recognition not supported'); return; }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = async (event: any) => {
      const command = event.results[0][0].transcript;
      setVoiceResult(`Heard: "${command}"`);
      const result = await api.processVoiceCommand(activeSession.id, command);
      if (result.actions_taken?.length) {
        setVoiceResult(`${result.actions_taken.map((a: any) => `${a.name}: ${a.new_status}`).join(', ')}`);
      }
      if (result.unmatched?.length) {
        setVoiceResult((v) => v + ` | Unmatched: ${result.unmatched.join(', ')}`);
      }
      loadSession(activeSession.id);
      setRecording(false);
    };
    recognition.onerror = () => { setRecording(false); setVoiceResult('Voice error'); };
    recognition.onend = () => setRecording(false);
    setRecording(true);
    recognition.start();
  };

  const statusColors: Record<string, string> = {
    present: '#dcfce7', absent: '#fee2e2', late: '#fef3c7', excused: '#dbeafe',
  };

  const counts = activeSession?.records?.reduce((acc: any, r: any) => {
    acc[r.status] = (acc[r.status] || 0) + 1;
    return acc;
  }, {} as Record<string, number>) || {};

  return (
    <div className="page">
      <Link to={`/courses/${courseId}`} style={{ color: '#1F3864', fontSize: '0.875rem' }}>Back to course</Link>
      <h1 style={{ marginTop: '0.5rem' }}>Attendance</h1>

      {!activeSession ? (
        <div>
          <button onClick={createSession} className="btn btn-primary" style={{ marginBottom: '1rem' }}>New Session (Today)</button>
          {analytics && analytics.sessions_count > 0 && (
            <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
              <h2 style={{ fontSize: '1rem', marginBottom: '0.75rem' }}>Analytics ({analytics.sessions_count} sessions)</h2>
              <div style={{ fontSize: '1.5rem', fontWeight: 700, color: analytics.course_attendance_rate >= 90 ? '#2d8a4e' : analytics.course_attendance_rate >= 70 ? '#c47f17' : '#c53030', marginBottom: '0.75rem' }}>
                {analytics.course_attendance_rate}% course attendance
              </div>
              <table className="vault-table" style={{ fontSize: '0.85rem' }}>
                <thead>
                  <tr><th>Student</th><th>Present</th><th>Absent</th><th>Late</th><th>Rate</th><th>Streak</th></tr>
                </thead>
                <tbody>
                  {analytics.students.map((s: any) => (
                    <tr key={s.id}>
                      <td>{s.name}</td>
                      <td>{s.present}</td>
                      <td style={{ color: s.absent > 0 ? '#c53030' : undefined }}>{s.absent}</td>
                      <td>{s.late}</td>
                      <td style={{ color: s.attendance_rate >= 90 ? '#2d8a4e' : s.attendance_rate >= 70 ? '#c47f17' : '#c53030', fontWeight: 600 }}>{s.attendance_rate}%</td>
                      <td>{s.current_streak > 0 ? `${s.current_streak} days` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {sessions.map((s) => (
            <div key={s.id} onClick={() => loadSession(s.id)} style={{ padding: '0.75rem', background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, marginBottom: '0.5rem', cursor: 'pointer' }}>
              {s.date} {s.finalized ? '(finalized)' : ''}
            </div>
          ))}
        </div>
      ) : (
        <div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center', marginBottom: '1rem', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600 }}>{activeSession.date}</span>
            <span style={{ color: '#2d8a4e' }}>{counts.present || 0} present</span>
            <span style={{ color: '#c53030' }}>{counts.absent || 0} absent</span>
            <span style={{ color: '#c47f17' }}>{counts.late || 0} late</span>
            {!activeSession.finalized && (
              <>
                <button onClick={startVoice} disabled={recording} className="btn btn-secondary btn-small">{recording ? 'Listening...' : 'Voice'}</button>
                <button onClick={finalize} className="btn btn-primary btn-small">Finalize</button>
              </>
            )}
            <a href={api.exportAttendance(activeSession.id)} className="btn btn-secondary btn-small" style={{ textDecoration: 'none' }}>Export CSV</a>
            <button onClick={() => setActiveSession(null)} className="btn btn-secondary btn-small">Back</button>
          </div>

          {voiceResult && <div className="status-msg info" style={{ marginBottom: '0.75rem' }}>{voiceResult}</div>}

          <div className="attendance-grid">
            {activeSession.records?.map((r: any) => (
              <div
                key={r.id}
                onClick={() => cycleStatus(r)}
                className="attendance-row"
                style={{ background: statusColors[r.status] || '#fff', cursor: activeSession.finalized ? 'default' : 'pointer' }}
              >
                <span className="attendance-name">{r.student_name}</span>
                <span className="attendance-status">{r.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Grading Page ----

function GradingPage() {
  const { courseId } = useParams();
  const [rubrics, setRubrics] = useState<any[]>([]);
  const [assignments, setAssignments] = useState<any[]>([]);
  const [activeSession, setActiveSession] = useState<any>(null);
  const [queue, setQueue] = useState<any[]>([]);
  const [activeStudent, setActiveStudent] = useState<any>(null);
  const [gradeItems, setGradeItems] = useState<any[]>([]);
  const [submissionText, setSubmissionText] = useState('');
  const [suggesting, setSuggesting] = useState(false);

  // Rubric creation state
  const [showNewRubric, setShowNewRubric] = useState(false);
  const [rubricName, setRubricName] = useState('');
  const [criteria, setCriteria] = useState([{ title: '', description: '', points_possible: 10 }]);

  // Assignment creation
  const [showNewAssignment, setShowNewAssignment] = useState(false);
  const [assignmentName, setAssignmentName] = useState('');
  const [selectedRubric, setSelectedRubric] = useState('');

  useEffect(() => {
    if (courseId) {
      api.getRubrics(courseId).then(setRubrics).catch(() => {});
      fetch(`/api/assignments?course_id=${courseId}`).then(r => r.json()).then(setAssignments).catch(() => {});
    }
  }, [courseId]);

  const createRubric = async () => {
    await api.createRubric({ name: rubricName, course_id: courseId, criteria });
    api.getRubrics(courseId).then(setRubrics);
    setShowNewRubric(false);
    setRubricName('');
    setCriteria([{ title: '', description: '', points_possible: 10 }]);
  };

  const createAssignment = async () => {
    await fetch('/api/assignments', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ name: assignmentName, course_id: courseId, rubric_id: selectedRubric }) });
    fetch(`/api/assignments?course_id=${courseId}`).then(r => r.json()).then(setAssignments);
    setShowNewAssignment(false);
  };

  const startGrading = async (assignmentId: string) => {
    const result = await api.createGradingSession({ assignment_id: assignmentId });
    openSession(result.id);
  };

  const openSession = async (id: string) => {
    const session = await api.getGradingSession(id);
    setActiveSession(session);
    const q = await api.getGradingQueue(id);
    setQueue(q);
  };

  const selectStudent = async (student: any) => {
    setActiveStudent(student);
    const items = await api.getGradeItems(activeSession.id, student.id);
    setGradeItems(items);
  };

  const requestSuggestions = async () => {
    if (!submissionText.trim()) return;
    setSuggesting(true);
    try {
      await api.requestSuggestion(activeSession.id, activeStudent.id, { submission_text: submissionText });
      const items = await api.getGradeItems(activeSession.id, activeStudent.id);
      setGradeItems(items);
    } catch {}
    setSuggesting(false);
  };

  const acceptSuggestion = (item: any) => {
    setGradeItems((prev) => prev.map((gi) =>
      gi.id === item.id ? { ...gi, professor_score: gi.suggested_score, professor_comment: gi.suggested_comment } : gi
    ));
  };

  const updateProfessorField = (itemId: string, field: string, value: any) => {
    setGradeItems((prev) => prev.map((gi) =>
      gi.id === itemId ? { ...gi, [field]: value } : gi
    ));
  };

  const approveItem = async (item: any) => {
    await api.updateGradeItem(item.id, { professor_score: item.professor_score, professor_comment: item.professor_comment });
    await api.approveGradeItem(item.id);
    const items = await api.getGradeItems(activeSession.id, activeStudent.id);
    setGradeItems(items);
    const q = await api.getGradingQueue(activeSession.id);
    setQueue(q);
  };

  // Student grading workspace
  if (activeStudent && activeSession) {
    return (
      <div className="page">
        <button onClick={() => setActiveStudent(null)} className="btn btn-secondary btn-small" style={{ marginBottom: '1rem' }}>Back to queue</button>
        <h1>{activeStudent.name}</h1>

        <div style={{ marginBottom: '1rem' }}>
          <label>Submission Text
            <textarea value={submissionText} onChange={(e) => setSubmissionText(e.target.value)} rows={6} placeholder="Paste student submission here..." style={{ width: '100%' }} />
          </label>
          <button onClick={requestSuggestions} disabled={suggesting} className="btn btn-primary btn-small" style={{ marginTop: '0.5rem' }}>
            {suggesting ? 'Generating...' : 'Get AI Suggestions'}
          </button>
        </div>

        {gradeItems.map((item) => (
          <div key={item.id} style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: '1rem', marginBottom: '0.75rem' }}>
            <div style={{ fontWeight: 600, marginBottom: '0.5rem' }}>{item.criterion_title} ({item.points_possible} pts)</div>
            {item.criterion_description && <div style={{ fontSize: '0.8rem', color: '#737373', marginBottom: '0.5rem' }}>{item.criterion_description}</div>}

            {item.suggested_score !== null && (
              <div style={{ background: '#f5f5f5', padding: '0.75rem', borderRadius: 6, marginBottom: '0.75rem' }}>
                <div style={{ fontSize: '0.8rem', color: '#737373', marginBottom: '0.25rem' }}>AI Suggestion</div>
                <div>Score: {item.suggested_score}/{item.points_possible}</div>
                <div style={{ fontSize: '0.875rem' }}>{item.suggested_comment}</div>
                {item.suggested_passage && <div style={{ fontSize: '0.8rem', color: '#737373', marginTop: '0.25rem' }}>Passage: "{item.suggested_passage}"</div>}
              </div>
            )}

            {item.status === 'approved' ? (
              <div className="status-msg success">Approved — Final: {item.final_score}/{item.points_possible}</div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <label style={{ flex: 0 }}>Score
                    <input type="number" min={0} max={item.points_possible} value={item.professor_score ?? ''} onChange={(e) => updateProfessorField(item.id, 'professor_score', e.target.value === '' ? null : parseFloat(e.target.value))} style={{ width: '80px' }} />
                  </label>
                </div>
                <label>Comment
                  <textarea value={item.professor_comment ?? ''} onChange={(e) => updateProfessorField(item.id, 'professor_comment', e.target.value)} rows={2} style={{ width: '100%' }} />
                </label>
                <div style={{ display: 'flex', gap: '0.5rem' }}>
                  {item.suggested_score !== null && (
                    <button onClick={() => acceptSuggestion(item)} className="btn btn-secondary btn-small">Accept Suggestion</button>
                  )}
                  <button onClick={() => updateProfessorField(item.id, 'professor_score', null)} className="btn btn-secondary btn-small">Clear</button>
                  <button onClick={() => approveItem(item)} disabled={item.professor_score === null} className="btn btn-primary btn-small">Approve</button>
                </div>
              </div>
            )}
          </div>
        ))}
      </div>
    );
  }

  // Grading queue
  if (activeSession) {
    return (
      <div className="page">
        <button onClick={() => setActiveSession(null)} className="btn btn-secondary btn-small" style={{ marginBottom: '1rem' }}>Back</button>
        <h1>Grading: {activeSession.assignment?.name}</h1>
        <a href={api.exportGrades(activeSession.id)} className="btn btn-secondary btn-small" style={{ textDecoration: 'none', marginBottom: '1rem', display: 'inline-block' }}>Export CSV</a>
        <div className="attendance-grid">
          {queue.map((s) => (
            <div key={s.id} onClick={() => selectStudent(s)} className="attendance-row" style={{ background: s.grading_status === 'complete' ? '#dcfce7' : s.grading_status === 'in_progress' ? '#fef3c7' : '#fff', cursor: 'pointer' }}>
              <span>{s.name}</span>
              <span style={{ fontSize: '0.8rem', color: '#737373' }}>{s.items_approved}/{s.items_total} approved</span>
            </div>
          ))}
        </div>
      </div>
    );
  }

  // Assignment/rubric management
  return (
    <div className="page">
      <Link to={`/courses/${courseId}`} style={{ color: '#1F3864', fontSize: '0.875rem' }}>Back to course</Link>
      <h1 style={{ marginTop: '0.5rem' }}>Grading</h1>
      <a href={api.exportCourseGrades(courseId!)} className="btn btn-secondary btn-small" style={{ textDecoration: 'none', marginBottom: '1rem', display: 'inline-block' }}>Export All Grades (CSV)</a>

      <h2 style={{ fontSize: '1rem', marginTop: '1rem' }}>Rubrics</h2>
      <button onClick={() => setShowNewRubric(!showNewRubric)} className="btn btn-secondary btn-small" style={{ marginBottom: '0.5rem' }}>New Rubric</button>

      {showNewRubric && (
        <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
          <label>Rubric Name<input type="text" value={rubricName} onChange={(e) => setRubricName(e.target.value)} /></label>
          {criteria.map((cr, i) => (
            <div key={i} style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
              <input type="text" placeholder="Criterion title" value={cr.title} onChange={(e) => { const c = [...criteria]; c[i].title = e.target.value; setCriteria(c); }} style={{ flex: 2 }} />
              <input type="text" placeholder="Description" value={cr.description} onChange={(e) => { const c = [...criteria]; c[i].description = e.target.value; setCriteria(c); }} style={{ flex: 3 }} />
              <input type="number" value={cr.points_possible} onChange={(e) => { const c = [...criteria]; c[i].points_possible = parseInt(e.target.value) || 0; setCriteria(c); }} style={{ width: '60px' }} />
            </div>
          ))}
          <div style={{ display: 'flex', gap: '0.5rem', marginTop: '0.5rem' }}>
            <button onClick={() => setCriteria([...criteria, { title: '', description: '', points_possible: 10 }])} className="btn btn-secondary btn-small">Add Criterion</button>
            <button onClick={createRubric} className="btn btn-primary btn-small">Save Rubric</button>
          </div>
        </div>
      )}

      {rubrics.map((r) => (
        <div key={r.id} style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: '0.75rem', marginBottom: '0.5rem' }}>{r.name}</div>
      ))}

      <h2 style={{ fontSize: '1rem', marginTop: '1.5rem' }}>Assignments</h2>
      <button onClick={() => setShowNewAssignment(!showNewAssignment)} className="btn btn-secondary btn-small" style={{ marginBottom: '0.5rem' }}>New Assignment</button>

      {showNewAssignment && (
        <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: '1rem', marginBottom: '1rem' }}>
          <label>Assignment Name<input type="text" value={assignmentName} onChange={(e) => setAssignmentName(e.target.value)} /></label>
          <label style={{ marginTop: '0.5rem' }}>Rubric
            <select value={selectedRubric} onChange={(e) => setSelectedRubric(e.target.value)}>
              <option value="">Select rubric...</option>
              {rubrics.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
            </select>
          </label>
          <button onClick={createAssignment} className="btn btn-primary btn-small" style={{ marginTop: '0.5rem' }}>Create</button>
        </div>
      )}

      {assignments.map((a: any) => (
        <div key={a.id} style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: '0.75rem', marginBottom: '0.5rem', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{a.name}</span>
          <button onClick={() => startGrading(a.id)} className="btn btn-primary btn-small" disabled={!a.rubric_id}>Start Grading</button>
        </div>
      ))}
    </div>
  );
}
