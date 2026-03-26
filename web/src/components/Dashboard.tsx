import { useState, useEffect } from 'react';
import CanvasSync from './CanvasSync';

type UserInfo = { exists: boolean; canvas_domain?: string; has_token?: boolean };
type Tab = 'home' | 'canvas';

export default function Dashboard() {
  const [user, setUser] = useState<UserInfo | null>(null);
  const [health, setHealth] = useState<{ status: string } | null>(null);
  const [tab, setTab] = useState<Tab>('home');

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
    <div style={{ fontFamily: 'system-ui, sans-serif', maxWidth: 640, margin: '40px auto', padding: '0 20px' }}>
      <h1 style={{ color: '#1a1a2e', marginBottom: 8 }}>MyTA Personal</h1>

      {/* Status bar */}
      <div style={styles.statusBar}>
        <span>
          <strong>API: </strong>
          {health ? <span style={{ color: '#2e7d32' }}>Connected</span> : <span style={{ color: '#666' }}>Checking...</span>}
        </span>
        <span style={{ margin: '0 8px', color: '#ddd' }}>|</span>
        <span>
          <strong>Vault: </strong>
          <span style={{ color: '#2e7d32' }}>Initialized</span>
        </span>
        {user?.exists && user.canvas_domain && (
          <>
            <span style={{ margin: '0 8px', color: '#ddd' }}>|</span>
            <span>
              <strong>Canvas: </strong>
              <span style={{ color: '#2e7d32' }}>{user.canvas_domain}</span>
            </span>
          </>
        )}
      </div>

      {/* Nav tabs */}
      <div style={styles.tabs}>
        {(['home', 'canvas'] as Tab[]).map((t) => (
          <button
            key={t}
            style={tab === t ? styles.tabActive : styles.tab}
            onClick={() => setTab(t)}
          >
            {t === 'home' ? 'Home' : 'Canvas Sync'}
          </button>
        ))}
      </div>

      {/* Tab content */}
      {tab === 'home' && (
        <div style={{ marginTop: 24, color: '#555', fontSize: 14 }}>
          <p><strong>Module Status:</strong></p>
          <ul style={{ lineHeight: 2.2, paddingLeft: 20 }}>
            <li style={{ color: '#2e7d32' }}>Auth &amp; Vault — Ready</li>
            <li style={{ color: '#2e7d32' }}>Canvas Sync — Ready</li>
            <li style={{ color: '#888' }}>Attendance — Not built</li>
            <li style={{ color: '#888' }}>Grading Review — Not built</li>
            <li style={{ color: '#888' }}>Syllabus Q&amp;A — Not built</li>
            <li style={{ color: '#888' }}>PWA — Not built</li>
          </ul>
        </div>
      )}

      {tab === 'canvas' && <CanvasSync />}
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  statusBar: {
    padding: '10px 14px',
    borderRadius: 8,
    background: '#e8f5e9',
    border: '1px solid #a5d6a7',
    fontSize: 13,
    marginBottom: 16,
  },
  tabs: {
    display: 'flex',
    gap: 0,
    borderBottom: '2px solid #eee',
  },
  tab: {
    padding: '10px 18px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid transparent',
    marginBottom: -2,
    fontSize: 14,
    color: '#888',
    cursor: 'pointer',
  },
  tabActive: {
    padding: '10px 18px',
    background: 'none',
    border: 'none',
    borderBottom: '2px solid #1a1a2e',
    marginBottom: -2,
    fontSize: 14,
    color: '#1a1a2e',
    fontWeight: 600,
    cursor: 'pointer',
  },
};
