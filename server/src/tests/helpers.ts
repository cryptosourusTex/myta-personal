import { mkdtempSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Hono } from 'hono';
import configRoutes from '../routes/config.js';
import canvasRoutes from '../routes/canvas.js';
import attendanceRoutes from '../routes/attendance.js';
import gradingRoutes from '../routes/grading.js';
import vaultRoutes from '../routes/vault.js';
import assistantRoutes from '../routes/assistant.js';

// Each test file runs in its own process (node --test isolation), so setting
// DB_PATH here gives every file a fresh throwaway database. The db module
// opens the database lazily on first request, after this assignment runs.
process.env.DB_PATH = join(mkdtempSync(join(tmpdir(), 'myta-test-')), 'test.db');

export function makeApp(): Hono {
  const app = new Hono();
  app.route('/api/config', configRoutes);
  app.route('/api', canvasRoutes);
  app.route('/api/attendance', attendanceRoutes);
  app.route('/api', gradingRoutes);
  app.route('/api/vault', vaultRoutes);
  app.route('/api/assistant', assistantRoutes);
  return app;
}

export async function json(
  app: Hono,
  path: string,
  method = 'GET',
  body?: unknown,
): Promise<{ status: number; body: any }> {
  const init: RequestInit = body !== undefined
    ? { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
    : { method };
  const res = await app.request(path, init);
  const parsed = await res.json().catch(() => null);
  return { status: res.status, body: parsed };
}

export async function seedCourse(app: Hono, names: string[]): Promise<{ courseId: string; studentIds: string[] }> {
  const course = await json(app, '/api/courses', 'POST', { name: 'Test Course' });
  const studentIds: string[] = [];
  for (const name of names) {
    const s = await json(app, `/api/courses/${course.body.id}/students`, 'POST', { name });
    studentIds.push(s.body.id);
  }
  return { courseId: course.body.id, studentIds };
}
