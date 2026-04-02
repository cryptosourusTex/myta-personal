import { useState, useEffect } from 'react';
import { api } from '../api';

interface SetupProps {
  onComplete: () => void;
}

export default function Setup({ onComplete }: SetupProps) {
  const [step, setStep] = useState(0);
  const [llmEndpoint, setLlmEndpoint] = useState('http://localhost:11434/v1');
  const [llmModel, setLlmModel] = useState('llama3.2');
  const [llmApiKey, setLlmApiKey] = useState('');
  const [llmStatus, setLlmStatus] = useState<{ ok?: boolean; model?: string; latency_ms?: number; error?: string } | null>(null);
  const [llmTesting, setLlmTesting] = useState(false);

  const [canvasDomain, setCanvasDomain] = useState('');
  const [canvasToken, setCanvasToken] = useState('');
  const [canvasStatus, setCanvasStatus] = useState<{ ok?: boolean; courses_count?: number; error?: string } | null>(null);
  const [canvasTesting, setCanvasTesting] = useState(false);

  const [encryption, setEncryption] = useState(false);

  useEffect(() => {
    api.getConfig().then((cfg) => {
      if (cfg.llm.endpoint) setLlmEndpoint(cfg.llm.endpoint);
      if (cfg.llm.model) setLlmModel(cfg.llm.model);
      if (cfg.canvas.domain) setCanvasDomain(cfg.canvas.domain);
      setEncryption(cfg.storage.encryption);
    }).catch(() => {});
  }, []);

  const saveLLM = async () => {
    await api.saveConfig({
      llm_endpoint: llmEndpoint,
      llm_model: llmModel,
      llm_api_key: llmApiKey,
    });
  };

  const testLLM = async () => {
    setLlmTesting(true);
    setLlmStatus(null);
    await saveLLM();
    try {
      const result = await api.testLLM();
      setLlmStatus(result);
    } catch (err: any) {
      setLlmStatus({ ok: false, error: err.message });
    }
    setLlmTesting(false);
  };

  const saveCanvas = async () => {
    await api.saveConfig({
      canvas_domain: canvasDomain,
      canvas_token: canvasToken,
    });
  };

  const testCanvas = async () => {
    setCanvasTesting(true);
    setCanvasStatus(null);
    await saveCanvas();
    try {
      const result = await api.testCanvas();
      setCanvasStatus(result);
    } catch (err: any) {
      setCanvasStatus({ ok: false, error: err.message });
    }
    setCanvasTesting(false);
  };

  const completeSetup = async () => {
    await saveLLM();
    if (canvasDomain && canvasToken) await saveCanvas();
    await api.saveConfig({
      storage_encryption: String(encryption),
      setup_complete: 'true',
    });
    onComplete();
  };

  return (
    <div className="setup-container">
      <h1>MyTA Personal Setup</h1>
      <p className="setup-subtitle">Configure your teaching assistant. Everything runs on your hardware.</p>

      <div className="setup-steps">
        <div className={`setup-step ${step === 0 ? 'active' : step > 0 ? 'done' : ''}`}>
          <h2>1. AI Model</h2>
          {step === 0 && (
            <div className="step-content">
              <label>
                Endpoint URL
                <input type="text" value={llmEndpoint} onChange={(e) => setLlmEndpoint(e.target.value)} placeholder="http://localhost:11434/v1" />
              </label>
              <label>
                Model Name
                <input type="text" value={llmModel} onChange={(e) => setLlmModel(e.target.value)} placeholder="llama3.2" />
              </label>
              <label>
                API Key <span className="optional">(optional — blank for local models)</span>
                <input type="password" value={llmApiKey} onChange={(e) => setLlmApiKey(e.target.value)} placeholder="Leave blank for Ollama" />
              </label>
              <button onClick={testLLM} disabled={llmTesting} className="btn btn-primary">
                {llmTesting ? 'Testing...' : 'Test Connection'}
              </button>
              {llmStatus && (
                <div className={`status-msg ${llmStatus.ok ? 'success' : 'error'}`}>
                  {llmStatus.ok
                    ? `Connected to ${llmStatus.model} (${llmStatus.latency_ms}ms)`
                    : `Error: ${llmStatus.error}`}
                </div>
              )}
              <button
                onClick={() => { saveLLM(); setStep(1); }}
                className="btn btn-secondary"
                disabled={!llmEndpoint || !llmModel}
              >
                Next
              </button>
            </div>
          )}
        </div>

        <div className={`setup-step ${step === 1 ? 'active' : step > 1 ? 'done' : ''}`}>
          <h2>2. Canvas <span className="optional">(optional)</span></h2>
          {step === 1 && (
            <div className="step-content">
              <p className="step-hint">Connect to Canvas to sync courses and rosters. Skip if you don't use Canvas.</p>
              <label>
                Canvas Domain
                <input type="text" value={canvasDomain} onChange={(e) => setCanvasDomain(e.target.value)} placeholder="college.instructure.com" />
              </label>
              <label>
                API Token
                <input type="password" value={canvasToken} onChange={(e) => setCanvasToken(e.target.value)} placeholder="Canvas personal access token" />
              </label>
              {canvasDomain && canvasToken && (
                <button onClick={testCanvas} disabled={canvasTesting} className="btn btn-primary">
                  {canvasTesting ? 'Testing...' : 'Test Connection'}
                </button>
              )}
              {canvasStatus && (
                <div className={`status-msg ${canvasStatus.ok ? 'success' : 'error'}`}>
                  {canvasStatus.ok
                    ? `Connected — ${canvasStatus.courses_count} courses found`
                    : `Error: ${canvasStatus.error}`}
                </div>
              )}
              <div className="step-buttons">
                <button onClick={() => setStep(0)} className="btn btn-secondary">Back</button>
                <button onClick={() => { if (canvasDomain && canvasToken) saveCanvas(); setStep(2); }} className="btn btn-secondary">
                  {canvasDomain && canvasToken ? 'Next' : 'Skip'}
                </button>
              </div>
            </div>
          )}
        </div>

        <div className={`setup-step ${step === 2 ? 'active' : step > 2 ? 'done' : ''}`}>
          <h2>3. Storage</h2>
          {step === 2 && (
            <div className="step-content">
              <div className="encryption-toggle">
                <label className="toggle-label">
                  <input type="checkbox" checked={encryption} onChange={(e) => setEncryption(e.target.checked)} />
                  <span>Encrypt vault files</span>
                </label>
                <p className="encryption-hint">
                  Recommended if storage is on a shared or cloud-synced location.
                  Not necessary if storing on your own password-protected device.
                </p>
              </div>
              <div className="step-buttons">
                <button onClick={() => setStep(1)} className="btn btn-secondary">Back</button>
                <button onClick={completeSetup} className="btn btn-primary">
                  Complete Setup
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
