import { useState, useEffect, useRef } from 'react';
import { api } from '../api';
import {
  hasStoredKey, getStoredKey, generateKey, storeKey, exportKey,
  downloadKeyBackup, readKeyFile, importKey, encryptFile, decryptFile,
} from '../crypto';

interface VaultAsset {
  id: string;
  name: string;
  type: string;
  course_id: string | null;
  size_bytes: number;
  encrypted: number;
  created_at: number;
}

export default function Vault() {
  const [assets, setAssets] = useState<VaultAsset[]>([]);
  const [encryptionEnabled, setEncryptionEnabled] = useState(false);
  const [keyReady, setKeyReady] = useState(false);
  const [needsKeySetup, setNeedsKeySetup] = useState(false);
  const [needsKeyRecovery, setNeedsKeyRecovery] = useState(false);
  const [keyBackedUp, setKeyBackedUp] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState('');
  const fileInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setEncryptionEnabled(cfg.storage.encryption);
      if (cfg.storage.encryption) {
        if (hasStoredKey()) {
          setKeyReady(true);
        } else {
          setNeedsKeySetup(true);
        }
      } else {
        setKeyReady(true);
      }
    });
    loadAssets();
  }, []);

  const loadAssets = () => {
    api.getVaultAssets().then(setAssets).catch(() => {});
  };

  const setupKey = async () => {
    const key = await generateKey();
    await storeKey(key);
    const b64 = await exportKey(key);
    downloadKeyBackup(b64);
    setKeyBackedUp(true);
  };

  const confirmKeyBackup = () => {
    setNeedsKeySetup(false);
    setKeyReady(true);
  };

  const recoverKey = async (file: File) => {
    try {
      const b64 = await readKeyFile(file);
      await importKey(b64); // validate
      const key = await importKey(b64);
      await storeKey(key);
      setNeedsKeyRecovery(false);
      setKeyReady(true);
    } catch {
      setError('Invalid key file');
    }
  };

  const handleUpload = async (files: FileList) => {
    setUploading(true);
    setError('');
    try {
      for (const file of Array.from(files)) {
        let uploadData: Blob = file;

        if (encryptionEnabled) {
          const key = await getStoredKey();
          if (!key) { setError('Encryption key not found'); return; }
          const plaintext = await file.arrayBuffer();
          const ciphertext = await encryptFile(plaintext, key);
          uploadData = new Blob([ciphertext]);
        }

        const formData = new FormData();
        formData.append('file', uploadData, file.name);
        await fetch('/api/vault/upload', { method: 'POST', body: formData }).then(r => {
          if (!r.ok) throw new Error('Upload failed');
          return r.json();
        });
      }
      loadAssets();
    } catch (err: any) {
      setError(err.message);
    }
    setUploading(false);
  };

  const handleDownload = async (asset: VaultAsset) => {
    try {
      const response = await fetch(api.downloadVaultAsset(asset.id));
      let data = await response.arrayBuffer();

      if (asset.encrypted) {
        const key = await getStoredKey();
        if (!key) { setError('Encryption key not found'); return; }
        data = await decryptFile(data, key);
      }

      const blob = new Blob([data], { type: asset.type });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = asset.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch {
      setError('Download failed — wrong encryption key?');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('Delete this file?')) return;
    await api.deleteVaultAsset(id);
    loadAssets();
  };

  const formatSize = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1048576) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / 1048576).toFixed(1)} MB`;
  };

  // Key setup screen
  if (needsKeySetup) {
    return (
      <div className="page">
        <h1>Vault Key Setup</h1>
        <div className="key-setup">
          <p>Your vault is configured with encryption. A key will be generated to encrypt your files.</p>
          <p><strong>This key encrypts your files. If you lose it and your backup, your files cannot be recovered.</strong></p>
          {!keyBackedUp ? (
            <button onClick={setupKey} className="btn btn-primary">Generate Key &amp; Download Backup</button>
          ) : (
            <div>
              <div className="status-msg success">Key generated and backup downloaded.</div>
              <button onClick={confirmKeyBackup} className="btn btn-primary" style={{ marginTop: '0.75rem' }}>
                I've saved my backup
              </button>
            </div>
          )}
        </div>
      </div>
    );
  }

  // Key recovery screen
  if (needsKeyRecovery) {
    return (
      <div className="page">
        <h1>Import Vault Key</h1>
        <p>Your vault key is missing. Import your backup key file to access encrypted files.</p>
        <input type="file" accept=".key" onChange={(e) => e.target.files?.[0] && recoverKey(e.target.files[0])} />
        {error && <div className="status-msg error">{error}</div>}
      </div>
    );
  }

  return (
    <div className="page">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <h1>Document Vault</h1>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input ref={fileInput} type="file" multiple hidden onChange={(e) => e.target.files && handleUpload(e.target.files)} />
          <button onClick={() => fileInput.current?.click()} disabled={uploading || !keyReady} className="btn btn-primary">
            {uploading ? 'Uploading...' : 'Upload Files'}
          </button>
        </div>
      </div>

      {encryptionEnabled && (
        <div className="status-msg info" style={{ marginBottom: '1rem' }}>
          Encryption is on — files are encrypted in your browser before upload.
        </div>
      )}

      {error && <div className="status-msg error" style={{ marginBottom: '1rem' }}>{error}</div>}

      {assets.length === 0 ? (
        <p style={{ color: '#737373' }}>No files yet. Upload syllabi, rubrics, or course materials.</p>
      ) : (
        <table className="vault-table">
          <thead>
            <tr>
              <th>Name</th>
              <th>Size</th>
              <th>Encrypted</th>
              <th>Uploaded</th>
              <th></th>
            </tr>
          </thead>
          <tbody>
            {assets.map((a) => (
              <tr key={a.id}>
                <td>{a.name}</td>
                <td>{formatSize(a.size_bytes)}</td>
                <td>{a.encrypted ? 'Yes' : 'No'}</td>
                <td>{new Date(a.created_at).toLocaleDateString()}</td>
                <td>
                  <button onClick={() => handleDownload(a)} className="btn btn-small btn-secondary">Download</button>
                  <button onClick={() => handleDelete(a.id)} className="btn btn-small btn-danger" style={{ marginLeft: '0.25rem' }}>Delete</button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
