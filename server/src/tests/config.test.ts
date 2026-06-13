import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, json } from './helpers.js';

test('config defaults: local endpoint, no remote-data override', async () => {
  const app = makeApp();
  const cfg = await json(app, '/api/config');
  assert.equal(cfg.status, 200);
  assert.equal(cfg.body.llm.endpoint_is_local, true);
  assert.equal(cfg.body.allow_remote_student_data, false);
  assert.equal(cfg.body.vision_model, '');
  assert.equal(cfg.body.embed_model, '');
});

test('config PUT honors the key allowlist', async () => {
  const app = makeApp();

  const result = await json(app, '/api/config', 'PUT', {
    vision_model: 'llama3.2-vision:latest',
    not_a_real_key: 'should be ignored',
  });
  assert.deepEqual(result.body.updated, ['vision_model']);

  const cfg = await json(app, '/api/config');
  assert.equal(cfg.body.vision_model, 'llama3.2-vision:latest');
});

test('config reports endpoint_is_local=false for remote endpoints', async () => {
  const app = makeApp();
  await json(app, '/api/config', 'PUT', { llm_endpoint: 'https://api.openai.com/v1' });
  const cfg = await json(app, '/api/config');
  assert.equal(cfg.body.llm.endpoint_is_local, false);
  await json(app, '/api/config', 'PUT', { llm_endpoint: 'http://localhost:11434/v1' });
});
