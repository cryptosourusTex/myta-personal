import { useState, useEffect } from 'react';
import { getVaultKey, decryptText, encryptText } from '../lib/vault';

type Course = {
  id: string;
  name: string;
  term: string | null;
  section_count: number;
  synced_at: number;
};

type SyncSummary = {
  courses: number;
  students: number;
  assignments: number;
  rubrics: number;
  errors: string[];
};

type SyncStatus = {
  synced: boolean;
  last_sync: number | null;
  last_sync_ago?: string;
  stale?: boolean;
};

export default function CanvasSync() {
  const [status, setStatus] = useState<SyncStatus | null>(null);
  const [courses, setCourses] = useState<Course[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [result, setResult] = useState<SyncSummary | null>(null);
  const [error, setError] = useState('');
  const [needsToken, setNeedsToken] = useState(false);
  const [tokenInput, setTokenInput] = useState('');
  const [savingToken, setSavingToken] = useState(false);

  useEffect(() => {
    loadStatus();
    loadCourses();
  }, []);

  async function loadStatus() {
    try {
      const res = await fetch('/api/canvas/status');
      setStatus(await res.json());
    } catch {}
  }

  async function loadCourses() {
    try {
      const res = await fetch('/api/canvas/courses');
      setCourses(await res.json());
    } catch {}
  }

  async function checkUser(): Promise<{ domain: string; token: string } | null> {
    const res = await fetch('/api/user/me');
    const user = await res.json();
    if (!user.exists || !user.canvas_domain) {
      setError('Canvas not configured. Go to settings and add your Canvas domain.');
      return null;
    }
    if (!user.has_token) {
      setNeedsToken(true);
      return null;
    }
    // For now, we need the client to send the decrypted token.
    // In a real flow, the encrypted token would be decrypted client-side.
    // For this personal build, we store the token in localStorage alongside the vault key.
    const storedToken = localStorage.getItem('myta_canvas_token');
    if (!storedToken) {
      setNeedsToken(true);
      return null;
    }
    return { domain: user.canvas_domain, token: storedToken };
  }

  async function handleSaveToken() {
    if (!tokenInput.trim()) return;
    setSavingToken(true);
    setError('');
    try {
      const key = await getVaultKey();
      if (!key) throw new Error('Vault key not found');
      const encrypted = await encryptText(tokenInput.trim(), key);

      // Save encrypted version to server
      await fetch('/api/user/canvas', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canvas_token_encrypted: encrypted,
        }),
      });

      // Store plaintext locally for sync calls
      localStorage.setItem('myta_canvas_token', tokenInput.trim());
      setNeedsToken(false);
      setTokenInput('');
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSavingToken(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError('');
    setResult(null);

    const creds = await checkUser();
    if (!creds) {
      setSyncing(false);
      return;
    }

    try {
      const res = await fetch('/api/canvas/sync', {
        method: 'POST',
        headers: { 'x-canvas-token': creds.token },
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Sync failed');
      setResult(data.summary);
      await loadStatus();
      await loadCourses();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSyncing(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.header}>
        <h2 style={{ margin: 0 }}>Canvas Sync</h2>
        <button
          style={syncing ? styles.buttonDisabled : styles.button}
          onClick={handleSync}
          disabled={syncing}
        >
          {syncing ? 'Syncing...' : 'Sync Now'}
        </button>
      </div>

      {/* Status */}
      {status && (
        <div style={{
          ...styles.statusBar,
          background: status.stale ? '#fff3e0' : '#e8f5e9',
          borderColor: status.stale ? '#ffcc80' : '#a5d6a7',
        }}>
          {status.synced ? (
            <>
              Last sync: {status.last_sync_ago}
              {status.stale && <span style={{ color: '#e65100', marginLeft: 8 }}>(stale — sync recommended)</span>}
            </>
          ) : (
            <span style={{ color: '#888' }}>Never synced — click Sync Now to pull from Canvas</span>
          )}
        </div>
      )}

      {/* Token prompt */}
      {needsToken && (
        <div style={styles.tokenBox}>
          <p style={{ margin: '0 0 8px', fontSize: 14 }}>
            Enter your Canvas personal access token. Generate one at Canvas → Account → Settings → New Access Token.
          </p>
          <div style={{ display: 'flex', gap: 8 }}>
            <input
              style={{ ...styles.input, flex: 1 }}
              type="password"
              placeholder="Canvas access token"
              value={tokenInput}
              onChange={(e) => setTokenInput(e.target.value)}
            />
            <button
              style={styles.button}
              onClick={handleSaveToken}
              disabled={savingToken}
            >
              {savingToken ? 'Saving...' : 'Save Token'}
            </button>
          </div>
        </div>
      )}

      {/* Sync result */}
      {result && (
        <div style={styles.resultBox}>
          <strong>Sync complete:</strong> {result.courses} courses, {result.students} students,{' '}
          {result.assignments} assignments, {result.rubrics} rubrics
          {result.errors.length > 0 && (
            <div style={{ marginTop: 8, color: '#c62828', fontSize: 13 }}>
              {result.errors.map((e, i) => (
                <div key={i}>⚠ {e}</div>
              ))}
            </div>
          )}
        </div>
      )}

      {error && <p style={{ color: '#c62828', fontSize: 14 }}>{error}</p>}

      {/* Course list */}
      {courses.length > 0 && (
        <div style={{ marginTop: 16 }}>
          <h3 style={{ margin: '0 0 12px', fontSize: 16, color: '#333' }}>Synced Courses</h3>
          {courses.map((course) => (
            <CourseCard key={course.id} course={course} />
          ))}
        </div>
      )}
    </div>
  );
}

function CourseCard({ course }: { course: Course }) {
  const [students, setStudents] = useState<any[] | null>(null);
  const [expanded, setExpanded] = useState(false);

  async function toggle() {
    if (!expanded && !students) {
      const res = await fetch(`/api/canvas/courses/${course.id}/students`);
      setStudents(await res.json());
    }
    setExpanded(!expanded);
  }

  return (
    <div style={styles.courseCard}>
      <div
        style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
        onClick={toggle}
      >
        <div>
          <strong>{course.name}</strong>
          {course.term && <span style={{ color: '#888', marginLeft: 8, fontSize: 13 }}>{course.term}</span>}
        </div>
        <span style={{ color: '#888', fontSize: 13 }}>
          {course.section_count} section{course.section_count !== 1 ? 's' : ''} · {expanded ? '▼' : '▶'}
        </span>
      </div>
      {expanded && students && (
        <div style={{ marginTop: 12, paddingLeft: 12, borderLeft: '2px solid #eee' }}>
          <p style={{ margin: '0 0 8px', fontSize: 13, color: '#888' }}>
            {students.length} student{students.length !== 1 ? 's' : ''}
          </p>
          {students.slice(0, 20).map((s: any) => (
            <div key={s.id} style={{ fontSize: 13, padding: '2px 0' }}>
              {s.name}{s.email && <span style={{ color: '#aaa', marginLeft: 8 }}>{s.email}</span>}
            </div>
          ))}
          {students.length > 20 && (
            <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
              ...and {students.length - 20} more
            </div>
          )}
        </div>
      )}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: { marginTop: 24 },
  header: {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  statusBar: {
    padding: '10px 14px',
    borderRadius: 6,
    border: '1px solid',
    fontSize: 14,
    marginBottom: 12,
  },
  button: {
    padding: '8px 16px',
    background: '#1a1a2e',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    cursor: 'pointer',
  },
  buttonDisabled: {
    padding: '8px 16px',
    background: '#999',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 14,
    cursor: 'not-allowed',
  },
  tokenBox: {
    padding: 16,
    background: '#fff3e0',
    borderRadius: 8,
    border: '1px solid #ffcc80',
    marginBottom: 12,
  },
  input: {
    padding: '8px 12px',
    border: '1px solid #ddd',
    borderRadius: 6,
    fontSize: 14,
    outline: 'none',
  },
  resultBox: {
    padding: 12,
    background: '#e8f5e9',
    borderRadius: 6,
    border: '1px solid #a5d6a7',
    fontSize: 14,
    marginBottom: 12,
  },
  courseCard: {
    padding: 14,
    background: '#fafafa',
    borderRadius: 8,
    border: '1px solid #eee',
    marginBottom: 8,
  },
};
