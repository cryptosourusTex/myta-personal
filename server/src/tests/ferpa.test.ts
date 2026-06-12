import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, json } from './helpers.js';
import { isLocalEndpoint, studentDataGuard } from '../ferpa.js';

test('isLocalEndpoint accepts local and private endpoints', () => {
  const local = [
    'http://localhost:11434/v1',
    'http://127.0.0.1:8080/v1',
    'http://[::1]:11434/v1',
    'http://10.0.0.5:11434/v1',
    'http://192.168.1.20:1234/v1',
    'http://172.16.0.1/v1',
    'http://172.31.255.254/v1',
    'http://100.64.0.1:11434/v1',
    'http://100.127.9.9:11434/v1',
    'http://my-mac.local:11434/v1',
    'http://workbench.tailnet-name.ts.net:11434/v1',
  ];
  for (const e of local) assert.ok(isLocalEndpoint(e), `expected local: ${e}`);
});

test('isLocalEndpoint rejects remote and malformed endpoints', () => {
  const remote = [
    'https://api.openai.com/v1',
    'https://api.anthropic.com/v1',
    'http://8.8.8.8/v1',
    'http://172.32.0.1/v1',
    'http://100.128.0.1/v1',
    'http://example.com:11434/v1',
    'not a url',
    '',
  ];
  for (const e of remote) assert.ok(!isLocalEndpoint(e), `expected remote: ${e}`);
});

test('studentDataGuard follows endpoint config and override flag', async () => {
  const app = makeApp();

  // Default config points at localhost Ollama: allowed
  assert.equal(studentDataGuard().allowed, true);

  // Remote endpoint: blocked with a reason
  await json(app, '/api/config', 'PUT', { llm_endpoint: 'https://api.openai.com/v1' });
  const blocked = studentDataGuard();
  assert.equal(blocked.allowed, false);
  assert.match(blocked.reason ?? '', /FERPA/);

  // Explicit professor override: allowed
  await json(app, '/api/config', 'PUT', { allow_remote_student_data: 'true' });
  assert.equal(studentDataGuard().allowed, true);

  // Back to local, override off
  await json(app, '/api/config', 'PUT', { llm_endpoint: 'http://localhost:11434/v1', allow_remote_student_data: 'false' });
  assert.equal(studentDataGuard().allowed, true);
});
