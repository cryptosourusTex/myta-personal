import { useState, useEffect } from 'react';
import { api } from '../api';
import type { TestResult } from '../api';

export default function Settings() {
  const [llmEndpoint, setLlmEndpoint] = useState('');
  const [llmModel, setLlmModel] = useState('');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmStatus, setLlmStatus] = useState<TestResult | null>(null);
  const [llmTesting, setLlmTesting] = useState(false);

  const [canvasDomain, setCanvasDomain] = useState('');
  const [canvasToken, setCanvasToken] = useState('');
  const [canvasStatus, setCanvasStatus] = useState<TestResult | null>(null);
  const [canvasTesting, setCanvasTesting] = useState(false);

  const [encryption, setEncryption] = useState(false);
  const [saved, setSaved] = useState(false);

  const [availableModels, setAvailableModels] = useState<Array<{ id: string; name: string; owned_by: string }>>([])
  const [gradingModel, setGradingModel] = useState('');
  const [qaModel, setQaModel] = useState('');
  const [visionModel, setVisionModel] = useState('');
  const [embedModel, setEmbedModel] = useState('');
  const [endpointIsLocal, setEndpointIsLocal] = useState(true);
  const [allowRemoteStudentData, setAllowRemoteStudentData] = useState(false);

  useEffect(() => {
    api.getConfig().then((cfg) => {
      setLlmEndpoint(cfg.llm.endpoint);
      setLlmModel(cfg.llm.model);
      setCanvasDomain(cfg.canvas.domain);
      setEncryption(cfg.storage.encryption);
      setGradingModel(cfg.grading_model || '');
      setQaModel(cfg.qa_model || '');
      setVisionModel(cfg.vision_model || '');
      setEmbedModel(cfg.embed_model || '');
      setEndpointIsLocal(cfg.llm.endpoint_is_local);
      setAllowRemoteStudentData(cfg.allow_remote_student_data);
    }).catch(() => {});
    api.getModels().then((result) => {
      if (result.ok && result.models) setAvailableModels(result.models);
    }).catch(() => {});
  }, []);

  const save = async () => {
    await api.saveConfig({
      llm_endpoint: llmEndpoint,
      llm_model: llmModel,
      ...(llmApiKey ? { llm_api_key: llmApiKey } : {}),
      canvas_domain: canvasDomain,
      ...(canvasToken ? { canvas_token: canvasToken } : {}),
      storage_encryption: String(encryption),
      ...(gradingModel ? { grading_model: gradingModel } : {}),
      ...(qaModel ? { qa_model: qaModel } : {}),
      ...(visionModel ? { vision_model: visionModel } : {}),
      ...(embedModel ? { embed_model: embedModel } : {}),
      allow_remote_student_data: String(allowRemoteStudentData),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 2000);
  };

  const testLLM = async () => {
    setLlmTesting(true);
    setLlmStatus(null);
    await save();
    try {
      setLlmStatus(await api.testLLM());
    } catch (err: unknown) {
      setLlmStatus({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    setLlmTesting(false);
  };

  const testCanvas = async () => {
    setCanvasTesting(true);
    setCanvasStatus(null);
    await save();
    try {
      setCanvasStatus(await api.testCanvas());
    } catch (err: unknown) {
      setCanvasStatus({ ok: false, error: err instanceof Error ? err.message : String(err) });
    }
    setCanvasTesting(false);
  };

  return (
    <div className="page">
      <h1>Settings</h1>

      <section className="settings-section">
        <h2>AI Model</h2>
        <label>Endpoint URL<input type="text" value={llmEndpoint} onChange={(e) => setLlmEndpoint(e.target.value)} /></label>
        <label>Model Name<input type="text" value={llmModel} onChange={(e) => setLlmModel(e.target.value)} /></label>
        {availableModels.length > 0 && (
          <div style={{ background: '#f5f5f5', padding: '0.75rem', borderRadius: 6, marginTop: '0.5rem' }}>
            <div style={{ fontSize: '0.85rem', fontWeight: 600, marginBottom: '0.5rem' }}>Per-task model override (optional)</div>
            <div style={{ display: 'flex', gap: '1rem', flexWrap: 'wrap' }}>
              <label style={{ flex: 1, minWidth: '200px' }}>Grading
                <select value={gradingModel} onChange={(e) => setGradingModel(e.target.value)}>
                  <option value="">Use default ({llmModel})</option>
                  {availableModels.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                </select>
              </label>
              <label style={{ flex: 1, minWidth: '200px' }}>Q&A Assistant
                <select value={qaModel} onChange={(e) => setQaModel(e.target.value)}>
                  <option value="">Use default ({llmModel})</option>
                  {availableModels.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                </select>
              </label>
              <label style={{ flex: 1, minWidth: '200px' }}>Photo OCR (vision)
                <select value={visionModel} onChange={(e) => setVisionModel(e.target.value)}>
                  <option value="">Use default ({llmModel})</option>
                  {availableModels.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                </select>
              </label>
              <label style={{ flex: 1, minWidth: '200px' }}>Document search (embeddings)
                <select value={embedModel} onChange={(e) => setEmbedModel(e.target.value)}>
                  <option value="">Default (nomic-embed-text)</option>
                  {availableModels.map((m) => <option key={m.id} value={m.id}>{m.id}</option>)}
                </select>
              </label>
            </div>
          </div>
        )}
        <label>API Key <span className="optional">(leave blank to keep current)</span><input type="password" value={llmApiKey} onChange={(e) => setLlmApiKey(e.target.value)} placeholder="unchanged" /></label>
        <button onClick={testLLM} disabled={llmTesting} className="btn btn-primary">{llmTesting ? 'Testing...' : 'Test Connection'}</button>
        {llmStatus && <div className={`status-msg ${llmStatus.ok ? 'success' : 'error'}`}>{llmStatus.ok ? `Connected to ${llmStatus.model} (${llmStatus.latency_ms}ms)` : `Error: ${llmStatus.error}`}</div>}
      </section>

      <section className="settings-section">
        <h2>Student Data Protection (FERPA)</h2>
        {endpointIsLocal ? (
          <div className="status-msg success">
            Your LLM endpoint is local — student names, submissions, and attendance photos never leave your machine or private network.
          </div>
        ) : (
          <div className="status-msg error">
            Your LLM endpoint is NOT local. Features that send student data to the AI (grading suggestions, photo attendance) are blocked unless you explicitly allow it below.
          </div>
        )}
        {!endpointIsLocal && (
          <label className="toggle-label" style={{ marginTop: '0.5rem' }}>
            <input type="checkbox" checked={allowRemoteStudentData} onChange={(e) => setAllowRemoteStudentData(e.target.checked)} />
            <span>Allow student data to be sent to this remote endpoint. I understand this may violate FERPA unless my institution has an agreement covering this provider.</span>
          </label>
        )}
        <p className="encryption-hint">See FERPA.md in the project repository for exactly what data flows where.</p>
      </section>

      <section className="settings-section">
        <h2>Canvas</h2>
        <label>Domain<input type="text" value={canvasDomain} onChange={(e) => setCanvasDomain(e.target.value)} placeholder="college.instructure.com" /></label>
        <label>API Token <span className="optional">(leave blank to keep current)</span><input type="password" value={canvasToken} onChange={(e) => setCanvasToken(e.target.value)} placeholder="unchanged" /></label>
        <button onClick={testCanvas} disabled={canvasTesting} className="btn btn-primary">{canvasTesting ? 'Testing...' : 'Test Connection'}</button>
        {canvasStatus && <div className={`status-msg ${canvasStatus.ok ? 'success' : 'error'}`}>{canvasStatus.ok ? `Connected — ${canvasStatus.courses_count} courses found` : `Error: ${canvasStatus.error}`}</div>}
      </section>

      <section className="settings-section">
        <h2>Storage</h2>
        <label className="toggle-label">
          <input type="checkbox" checked={encryption} onChange={(e) => setEncryption(e.target.checked)} />
          <span>Encrypt vault files</span>
        </label>
        <p className="encryption-hint">Recommended if storage is on a shared or cloud-synced location.</p>
      </section>

      <section className="settings-section">
        <h2>Access from iPhone</h2>
        <div className="tailscale-guide">
          <ol>
            <li>Install Tailscale on this computer (tailscale.com)</li>
            <li>Install Tailscale on your iPhone (App Store)</li>
            <li>Sign in to the same Tailscale account on both</li>
            <li>Find this machine's Tailscale IP in the Tailscale app</li>
            <li>Open http://[tailscale-ip]:3456 in iPhone Safari</li>
            <li>Tap Share then Add to Home Screen</li>
          </ol>
        </div>
      </section>

      <button onClick={save} className="btn btn-primary">{saved ? 'Saved' : 'Save Settings'}</button>
    </div>
  );
}
