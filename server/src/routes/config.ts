import { Hono } from 'hono';
import { getDb } from '../db/index.js';
import { getConfig } from '../config.js';
import OpenAI from 'openai';

const configRoutes = new Hono();

// Get current config (no secrets exposed)
configRoutes.get('/', (c) => {
  const db = getDb();
  const rows = db.prepare('SELECT key, value FROM config').all() as { key: string; value: string }[];
  const stored: Record<string, string> = {};
  for (const row of rows) {
    stored[row.key] = row.value;
  }

  return c.json({
    llm: {
      endpoint: stored.llm_endpoint || getConfig().llm.endpoint,
      model: stored.llm_model || getConfig().llm.model,
      has_api_key: !!(stored.llm_api_key || getConfig().llm.api_key),
      context_window: parseInt(stored.llm_context_window || '') || getConfig().llm.context_window,
    },
    canvas: {
      domain: stored.canvas_domain || getConfig().canvas.domain,
      has_token: !!stored.canvas_token,
    },
    storage: {
      path: getConfig().storage.path,
      encryption: stored.storage_encryption === 'true' || getConfig().storage.encryption,
    },
    accessibility: {
      voice_input: getConfig().accessibility.voice_input,
      voice_readback: getConfig().accessibility.voice_readback,
    },
    setup_complete: stored.setup_complete === 'true',
  });
});

// Save config values
configRoutes.put('/', async (c) => {
  const body = await c.req.json();
  const db = getDb();
  const upsert = db.prepare('INSERT INTO config (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = ?');

  const allowedKeys = [
    'llm_endpoint', 'llm_model', 'llm_api_key', 'llm_context_window',
    'canvas_domain', 'canvas_token',
    'storage_encryption',
    'setup_complete',
  ];

  const updates: string[] = [];
  for (const [key, value] of Object.entries(body)) {
    if (allowedKeys.includes(key)) {
      const val = String(value);
      upsert.run(key, val, val);
      updates.push(key);
    }
  }

  return c.json({ updated: updates });
});

// Test LLM connection
configRoutes.post('/test-llm', async (c) => {
  const db = getDb();
  const getVal = (key: string) => {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  };

  const endpoint = getVal('llm_endpoint') || getConfig().llm.endpoint;
  const model = getVal('llm_model') || getConfig().llm.model;
  const apiKey = getVal('llm_api_key') || getConfig().llm.api_key || 'none';

  const start = Date.now();
  try {
    const client = new OpenAI({ baseURL: endpoint, apiKey });
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: 'Say "hello" and nothing else.' }],
      max_tokens: 10,
    });
    const latency = Date.now() - start;
    return c.json({
      ok: true,
      model: response.model || model,
      latency_ms: latency,
    });
  } catch (err: any) {
    return c.json({
      ok: false,
      error: err.message || 'Connection failed',
    }, 500);
  }
});

// Test Canvas connection
configRoutes.post('/test-canvas', async (c) => {
  const db = getDb();
  const getVal = (key: string) => {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  };

  const domain = getVal('canvas_domain') || getConfig().canvas.domain;
  const token = getVal('canvas_token');

  if (!domain || !token) {
    return c.json({ ok: false, error: 'Canvas domain and token are required' }, 400);
  }

  try {
    const response = await fetch(`https://${domain}/api/v1/courses?enrollment_type=teacher&enrollment_state=active&per_page=5`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    if (!response.ok) {
      return c.json({ ok: false, error: `Canvas API error: ${response.status}` }, response.status);
    }

    const courses = await response.json();
    return c.json({
      ok: true,
      courses_count: Array.isArray(courses) ? courses.length : 0,
    });
  } catch (err: any) {
    return c.json({ ok: false, error: err.message || 'Connection failed' }, 500);
  }
});

export default configRoutes;
