import { useState, useEffect } from 'react';
import { api } from '../api';
import { getStoredKey, decryptFile, hasStoredKey } from '../crypto';

interface VaultAsset {
  id: string;
  name: string;
  encrypted: number;
}

export default function Assistant() {
  const [courses, setCourses] = useState<any[]>([]);
  const [selectedCourse, setSelectedCourse] = useState('');
  const [assets, setAssets] = useState<VaultAsset[]>([]);
  const [selectedAssets, setSelectedAssets] = useState<Set<string>>(new Set());
  const [question, setQuestion] = useState('');
  const [result, setResult] = useState<any>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [recording, setRecording] = useState(false);

  useEffect(() => {
    api.getCourses().then(setCourses).catch(() => {});
    api.getVaultAssets().then(setAssets).catch(() => {});
  }, []);

  useEffect(() => {
    if (selectedCourse) {
      api.getVaultAssets(selectedCourse).then(setAssets).catch(() => {});
    } else {
      api.getVaultAssets().then(setAssets).catch(() => {});
    }
    setSelectedAssets(new Set());
  }, [selectedCourse]);

  const toggleAsset = (id: string) => {
    setSelectedAssets((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const loadDocumentContents = async () => {
    const contents: { id: string; name: string; text: string }[] = [];
    for (const id of selectedAssets) {
      const asset = assets.find((a) => a.id === id);
      if (!asset) continue;

      const response = await fetch(api.downloadVaultAsset(id));
      let data = await response.arrayBuffer();

      if (asset.encrypted && hasStoredKey()) {
        const key = await getStoredKey();
        if (key) data = await decryptFile(data, key);
      }

      const text = new TextDecoder().decode(data);
      contents.push({ id, name: asset.name, text });
    }
    return contents;
  };

  const ask = async () => {
    if (!question.trim() || selectedAssets.size === 0) return;
    setLoading(true);
    setError('');
    setResult(null);
    setAcknowledged(false);

    try {
      const docContents = await loadDocumentContents();
      const answer = await api.askAssistant({
        question,
        course_id: selectedCourse || null,
        document_contents: docContents,
      });
      setResult(answer);
    } catch (err: any) {
      setError(err.message);
    }
    setLoading(false);
  };

  const startVoice = () => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) { setError('Speech recognition not supported'); return; }
    const recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (event: any) => {
      setQuestion(event.results[0][0].transcript);
      setRecording(false);
    };
    recognition.onerror = () => setRecording(false);
    recognition.onend = () => setRecording(false);
    setRecording(true);
    recognition.start();
  };

  const readAloud = () => {
    if (!result?.draft) return;
    const utterance = new SpeechSynthesisUtterance(result.draft);
    window.speechSynthesis.speak(utterance);
  };

  const copyDraft = () => {
    if (result?.draft) navigator.clipboard.writeText(result.draft);
  };

  const showWarning = result?.confidence === 'not_in_documents' && !acknowledged;

  return (
    <div className="page">
      <h1>Q&A Assistant</h1>
      <p style={{ color: '#737373', marginBottom: '1rem', fontSize: '0.875rem' }}>
        Drafts answers from your course documents. Never sends — only drafts for you to review.
      </p>

      <div style={{ display: 'flex', gap: '0.75rem', marginBottom: '1rem', flexWrap: 'wrap' }}>
        <label style={{ flex: 1, minWidth: '200px' }}>
          Course (optional)
          <select value={selectedCourse} onChange={(e) => setSelectedCourse(e.target.value)}>
            <option value="">All courses</option>
            {courses.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
        </label>
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <div style={{ fontWeight: 500, fontSize: '0.875rem', marginBottom: '0.25rem' }}>Documents to search</div>
        {assets.length === 0 ? (
          <p style={{ color: '#737373', fontSize: '0.875rem' }}>No documents in vault. Upload files first.</p>
        ) : (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.5rem' }}>
            {assets.map((a) => (
              <label key={a.id} className="toggle-label" style={{ background: selectedAssets.has(a.id) ? '#dbeafe' : 'white', border: '1px solid #e5e5e5', borderRadius: 6, padding: '0.375rem 0.75rem', fontSize: '0.8rem' }}>
                <input type="checkbox" checked={selectedAssets.has(a.id)} onChange={() => toggleAsset(a.id)} />
                <span>{a.name}</span>
              </label>
            ))}
          </div>
        )}
      </div>

      <div style={{ marginBottom: '1rem' }}>
        <label>
          Student Question
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <textarea value={question} onChange={(e) => setQuestion(e.target.value)} rows={3} style={{ flex: 1 }} placeholder="Type or dictate a student question..." />
            <button onClick={startVoice} disabled={recording} className="btn btn-secondary" style={{ alignSelf: 'flex-start' }}>
              {recording ? 'Listening...' : 'Voice'}
            </button>
          </div>
        </label>
      </div>

      <button onClick={ask} disabled={loading || !question.trim() || selectedAssets.size === 0} className="btn btn-primary">
        {loading ? 'Drafting...' : 'Draft Answer'}
      </button>

      {error && <div className="status-msg error" style={{ marginTop: '1rem' }}>{error}</div>}

      {showWarning && (
        <div className="status-msg warning" style={{ marginTop: '1rem' }}>
          <strong>This question is not clearly addressed in your uploaded materials.</strong>
          <br />Review carefully before sending.
          <br /><button onClick={() => setAcknowledged(true)} className="btn btn-secondary btn-small" style={{ marginTop: '0.5rem' }}>I understand — show draft</button>
        </div>
      )}

      {result && (!showWarning) && (
        <div style={{ background: 'white', border: '1px solid #e5e5e5', borderRadius: 8, padding: '1rem', marginTop: '1rem' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' }}>
            <span style={{ fontSize: '0.8rem', color: result.confidence === 'clearly_answered' ? '#166534' : result.confidence === 'partially_answered' ? '#92400e' : '#991b1b', fontWeight: 600 }}>
              {result.confidence?.replace(/_/g, ' ')}
            </span>
            <div style={{ display: 'flex', gap: '0.25rem' }}>
              <button onClick={readAloud} className="btn btn-secondary btn-small">Read Aloud</button>
              <button onClick={copyDraft} className="btn btn-primary btn-small">Copy</button>
            </div>
          </div>
          <div style={{ fontSize: '0.95rem', lineHeight: 1.6, marginBottom: '0.75rem' }}>{result.draft}</div>
          <div style={{ fontSize: '0.8rem', color: '#737373' }}>Source: {result.source}</div>
        </div>
      )}
    </div>
  );
}
