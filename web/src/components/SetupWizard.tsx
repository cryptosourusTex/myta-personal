import { useState } from 'react';
import {
  generateVaultKey,
  exportKeyBackup,
  importKeyBackup,
} from '../lib/vault';

type Step = 'welcome' | 'generate' | 'backup' | 'canvas' | 'done';

export default function SetupWizard({
  onComplete,
}: {
  onComplete: () => void;
}) {
  const [step, setStep] = useState<Step>('welcome');
  const [backupPassword, setBackupPassword] = useState('');
  const [backupConfirm, setBackupConfirm] = useState('');
  const [backupDone, setBackupDone] = useState(false);
  const [canvasDomain, setCanvasDomain] = useState('');
  const [canvasToken, setCanvasToken] = useState('');
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);
  const [restoreMode, setRestoreMode] = useState(false);
  const [restoreFile, setRestoreFile] = useState('');
  const [restorePassword, setRestorePassword] = useState('');

  async function handleGenerate() {
    try {
      await generateVaultKey();
      setStep('backup');
    } catch (e: any) {
      setError(e.message);
    }
  }

  async function handleRestore() {
    try {
      setError('');
      await importKeyBackup(restoreFile, restorePassword);
      setStep('canvas');
    } catch {
      setError('Invalid backup file or wrong password.');
    }
  }

  async function handleBackup() {
    if (backupPassword.length < 8) {
      setError('Password must be at least 8 characters.');
      return;
    }
    if (backupPassword !== backupConfirm) {
      setError('Passwords do not match.');
      return;
    }
    setError('');
    const json = await exportKeyBackup(backupPassword);
    const blob = new Blob([json], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'myta-vault-backup.json';
    a.click();
    URL.revokeObjectURL(url);
    setBackupDone(true);
  }

  async function handleCanvasSave() {
    if (!canvasDomain.trim()) {
      setStep('done');
      onComplete();
      return;
    }
    setSaving(true);
    setError('');
    try {
      const res = await fetch('/api/user/setup', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          canvas_domain: canvasDomain.trim(),
          canvas_token_encrypted: canvasToken.trim() || null,
        }),
      });
      if (!res.ok) throw new Error(await res.text());
      setStep('done');
      onComplete();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div style={styles.container}>
      <div style={styles.card}>
        <h1 style={styles.title}>MyTA Personal</h1>

        {step === 'welcome' && (
          <>
            <p style={styles.text}>
              Welcome. This is your personal teaching assistant — single user,
              your data, your device.
            </p>
            <p style={styles.text}>
              First, we need to create your vault encryption key. This key
              encrypts everything stored on the server. It never leaves your
              browser.
            </p>
            <div style={styles.buttonRow}>
              <button style={styles.primary} onClick={handleGenerate}>
                Create New Vault Key
              </button>
              <button
                style={styles.secondary}
                onClick={() => setRestoreMode(true)}
              >
                Restore from Backup
              </button>
            </div>
            {restoreMode && (
              <div style={{ marginTop: 16 }}>
                <textarea
                  style={styles.textarea}
                  placeholder="Paste backup JSON contents here..."
                  value={restoreFile}
                  onChange={(e) => setRestoreFile(e.target.value)}
                  rows={4}
                />
                <input
                  style={styles.input}
                  type="password"
                  placeholder="Backup password"
                  value={restorePassword}
                  onChange={(e) => setRestorePassword(e.target.value)}
                />
                <button style={styles.primary} onClick={handleRestore}>
                  Restore Key
                </button>
              </div>
            )}
          </>
        )}

        {step === 'backup' && (
          <>
            <p style={styles.text}>
              Your vault key has been created and stored in this browser.
            </p>
            <p style={{ ...styles.text, color: '#c62828', fontWeight: 600 }}>
              If you clear browser data without a backup, your encrypted files
              become permanently unreadable.
            </p>
            <input
              style={styles.input}
              type="password"
              placeholder="Backup password (min 8 characters)"
              value={backupPassword}
              onChange={(e) => setBackupPassword(e.target.value)}
            />
            <input
              style={styles.input}
              type="password"
              placeholder="Confirm password"
              value={backupConfirm}
              onChange={(e) => setBackupConfirm(e.target.value)}
            />
            <button style={styles.primary} onClick={handleBackup}>
              Download Encrypted Backup
            </button>
            {backupDone && (
              <>
                <p style={{ ...styles.text, color: '#2e7d32', marginTop: 12 }}>
                  Backup downloaded. Store it somewhere safe.
                </p>
                <button
                  style={styles.primary}
                  onClick={() => setStep('canvas')}
                >
                  Continue
                </button>
              </>
            )}
          </>
        )}

        {step === 'canvas' && (
          <>
            <p style={styles.text}>
              Connect your Canvas LMS. You can skip this and set it up later.
            </p>
            <input
              style={styles.input}
              type="text"
              placeholder="Canvas domain (e.g. college.instructure.com)"
              value={canvasDomain}
              onChange={(e) => setCanvasDomain(e.target.value)}
            />
            {canvasDomain && (
              <input
                style={styles.input}
                type="password"
                placeholder="Canvas personal access token"
                value={canvasToken}
                onChange={(e) => setCanvasToken(e.target.value)}
              />
            )}
            <div style={styles.buttonRow}>
              <button
                style={styles.primary}
                onClick={handleCanvasSave}
                disabled={saving}
              >
                {canvasDomain
                  ? saving
                    ? 'Saving...'
                    : 'Save & Continue'
                  : 'Skip for Now'}
              </button>
            </div>
          </>
        )}

        {error && <p style={styles.error}>{error}</p>}
      </div>
    </div>
  );
}

const styles: Record<string, React.CSSProperties> = {
  container: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 20,
  },
  card: {
    maxWidth: 480,
    width: '100%',
    background: '#fff',
    borderRadius: 12,
    padding: 32,
    boxShadow: '0 2px 12px rgba(0,0,0,0.08)',
  },
  title: { color: '#1a1a2e', marginBottom: 16 },
  text: { color: '#555', lineHeight: 1.6, marginBottom: 12, fontSize: 15 },
  input: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: 6,
    fontSize: 15,
    marginBottom: 12,
    outline: 'none',
  },
  textarea: {
    width: '100%',
    padding: '10px 12px',
    border: '1px solid #ddd',
    borderRadius: 6,
    fontSize: 13,
    fontFamily: 'monospace',
    marginBottom: 12,
    outline: 'none',
    resize: 'vertical' as const,
  },
  buttonRow: { display: 'flex', gap: 12, marginTop: 8 },
  primary: {
    padding: '10px 20px',
    background: '#1a1a2e',
    color: '#fff',
    border: 'none',
    borderRadius: 6,
    fontSize: 15,
    cursor: 'pointer',
  },
  secondary: {
    padding: '10px 20px',
    background: '#f5f5f5',
    color: '#333',
    border: '1px solid #ddd',
    borderRadius: 6,
    fontSize: 15,
    cursor: 'pointer',
  },
  error: { color: '#c62828', marginTop: 12, fontSize: 14 },
};
