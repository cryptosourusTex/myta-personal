import { useState, useEffect } from 'react';

type HealthStatus = { status: string; timestamp: number } | null;

export default function App() {
  const [health, setHealth] = useState<HealthStatus>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then(setHealth)
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 600, margin: '80px auto', padding: '0 20px' }}>
      <h1 style={{ color: '#1a1a2e' }}>MyTA Personal</h1>
      <p style={{ color: '#666' }}>Module 0 — Scaffolding complete</p>

      <div style={{
        marginTop: 24,
        padding: 16,
        borderRadius: 8,
        background: health ? '#e8f5e9' : error ? '#ffebee' : '#f5f5f5',
        border: `1px solid ${health ? '#a5d6a7' : error ? '#ef9a9a' : '#ddd'}`,
      }}>
        <strong>API Status: </strong>
        {health ? (
          <span style={{ color: '#2e7d32' }}>Connected — {health.status}</span>
        ) : error ? (
          <span style={{ color: '#c62828' }}>Not connected — {error}</span>
        ) : (
          <span style={{ color: '#666' }}>Checking...</span>
        )}
      </div>

      <div style={{ marginTop: 32, color: '#888', fontSize: 14 }}>
        <p><strong>Next steps:</strong></p>
        <ul>
          <li>Module 1 — Auth &amp; vault key setup</li>
          <li>Module 2 — Canvas sync</li>
          <li>Module 3 — Attendance</li>
          <li>Module 4 — Grading review</li>
          <li>Module 5 — Syllabus Q&amp;A</li>
          <li>Module 6 — PWA &amp; service worker</li>
        </ul>
      </div>
    </div>
  );
}
