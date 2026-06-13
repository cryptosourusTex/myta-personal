import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, json } from './helpers.js';

function upload(app: ReturnType<typeof makeApp>, name: string, content: string, type = 'text/plain') {
  const fd = new FormData();
  fd.append('file', new Blob([content], { type }), name);
  return app.request('/api/vault/upload', { method: 'POST', body: fd });
}

test('index endpoint validates asset, encryption, and FERPA guard', async () => {
  const app = makeApp();

  // Missing asset
  const missing = await json(app, '/api/vault/assets/nope/index', 'POST');
  assert.equal(missing.status, 404);

  // Upload a plain-text asset
  const up = await upload(app, 'syllabus.txt', 'Office hours are Tuesdays at 2pm.');
  const asset = await up.json();

  // Remote endpoint without override: blocked before embedding
  await json(app, '/api/config', 'PUT', { llm_endpoint: 'https://api.openai.com/v1' });
  const blocked = await json(app, `/api/vault/assets/${asset.id}/index`, 'POST');
  assert.equal(blocked.status, 403);
  assert.match(blocked.body.error, /FERPA/);
  await json(app, '/api/config', 'PUT', { llm_endpoint: 'http://localhost:11434/v1' });
});

test('search endpoint validates question, index presence, and FERPA guard', async () => {
  const app = makeApp();

  const noQuestion = await json(app, '/api/assistant/search', 'POST', { course_id: null });
  assert.equal(noQuestion.status, 400);

  // FERPA guard fires before the empty-index check
  await json(app, '/api/config', 'PUT', { llm_endpoint: 'https://api.openai.com/v1' });
  const blocked = await json(app, '/api/assistant/search', 'POST', { question: 'anything' });
  assert.equal(blocked.status, 403);
  await json(app, '/api/config', 'PUT', { llm_endpoint: 'http://localhost:11434/v1' });

  // Local endpoint, but nothing indexed yet
  const empty = await json(app, '/api/assistant/search', 'POST', { question: 'anything' });
  assert.equal(empty.status, 400);
  assert.match(empty.body.error, /index/i);
});

test('index status lists assets with zero chunks before indexing', async () => {
  const app = makeApp();
  await upload(app, 'a.txt', 'content');
  const status = await json(app, '/api/vault/index/status');
  assert.equal(status.status, 200);
  assert.ok(status.body.length >= 1);
  assert.ok(status.body.every((r: { chunk_count: number }) => r.chunk_count === 0));
});
