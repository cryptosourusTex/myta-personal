import { useState, useEffect } from 'react';

type UserInfo = { exists: boolean; canvas_domain?: string; has_token?: boolean };

export default function Dashboard() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [health, setHealth] = useState<{ status: string } | null>(null);

  useEffect(() => {
    fetch('/api/health')
      .then((r) => r.json())
      .then(setHealth)
      .catch(() => {});
    fetch('/api/user/me')
      .then((r) => r.json())
      .then(setUser)
      .catch(() => {});
  }, []);

  return (
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 600, margin: '80px auto', padding: '0 20px' }}>
      <h1 style={{ color: '#1a1a2e' }}>MyTA Personal</h1>

      <div style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 8,
        background: health ? '#e8f5e9' : '#f5f5f5',
        border: `1px solid ${health ? '#a5d6a7' : '#ddd'}`,
      }}>
        <strong>API: </strong>
        {health ? (
          <span style={{ color: '#2e7d32' }}>Connected</span>
        ) : (
          <span style={{ color: '#666' }}>Checking...</span>
        )}
        {user?.exists && (
          <>
            <span style={{ margin: '0 8px', color: '#ccc' }}>|</span>
            <strong>Canvas: </strong>
            {user.canvas_domain ? (
              <span style={{ color: '#2e7d32' }}>
                {user.canvas_domain} {user.has_token ? '(token saved)' : '(no token)'}
              </span>
            ) : (
              <span style={{ color: '#888' }}>Not configured</span>
            )}
          </>
        )}
      </div>

      <div style={{
        marginTop: 16,
        padding: 16,
        borderRadius: 8,
        background: '#e8f5e9',
        border: '1px solid #a5d6a7',
      }}>
        <strong>Vault: </strong>
        <span style={{ color: '#2e7d32' }}>Initialized — key stored in this browser</span>
      </div>

      <div style={{ marginTop: 32, color: '#888', fontSize: 14 }}>
        <p><strong>Modules:</strong></p>
        <ul style={{ lineHeight: 2 }}>
          <li style={{ color: '#2e7d32' }}>Auth &amp; Vault — Ready</li>
          <li>Canvas Sync — Not built</li>
          <li>Attendance — Not built</li>
          <li>Grading Review — Not built</li>
          <li>Syllabus Q&amp;A — Not built</li>
          <li>PWA — Not built</li>
        </ul>
      </div>
    </div>
  );
}
