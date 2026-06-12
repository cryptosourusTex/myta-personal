import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, json, seedCourse } from './helpers.js';

const VALID_IMAGE = 'data:image/jpeg;base64,AAAA';

test('attendance lifecycle: session, records, voice, finalize, export', async () => {
  const app = makeApp();
  const { courseId } = await seedCourse(app, ['Maria Gonzalez', 'James Okafor', 'Lily Chen']);

  const created = await json(app, '/api/attendance/sessions', 'POST', { course_id: courseId, date: '2026-06-10' });
  assert.equal(created.status, 200);
  assert.equal(created.body.record_count, 3);
  const sessionId = created.body.id;

  const session = await json(app, `/api/attendance/sessions/${sessionId}`);
  assert.equal(session.body.records.length, 3);
  assert.ok(session.body.records.every((r: { status: string }) => r.status === 'absent'));

  const recordId = session.body.records[0].id;
  const updated = await json(app, `/api/attendance/records/${recordId}`, 'PUT', { status: 'present', source: 'manual' });
  assert.equal(updated.status, 200);

  const voice = await json(app, `/api/attendance/sessions/${sessionId}/voice`, 'POST', { command: 'everyone present' });
  assert.equal(voice.body.actions_taken.length, 3);
  assert.ok(voice.body.actions_taken.every((a: { new_status: string }) => a.new_status === 'present'));

  const markVoice = await json(app, `/api/attendance/sessions/${sessionId}/voice`, 'POST', { command: 'mark Lily Chen absent' });
  assert.equal(markVoice.body.actions_taken.length, 1);
  assert.equal(markVoice.body.actions_taken[0].new_status, 'absent');

  const finalized = await json(app, `/api/attendance/sessions/${sessionId}/finalize`, 'POST');
  assert.equal(finalized.body.finalized, sessionId);

  const exportRes = await app.request(`/api/attendance/sessions/${sessionId}/export`);
  const csv = await exportRes.text();
  assert.match(csv, /student_name,student_id,date,status,note/);
  assert.match(csv, /Maria Gonzalez/);
  assert.match(csv, /"Lily Chen".*"absent"/);
});

test('analytics: rates, recent, at-risk flags, session summaries', async () => {
  const app = makeApp();
  const { courseId, studentIds } = await seedCourse(app, ['Alice Steady', 'Bob Fading']);
  const [, bob] = studentIds;

  // Three sessions; Bob misses the last two
  for (const date of ['2026-06-08', '2026-06-09', '2026-06-10']) {
    const created = await json(app, '/api/attendance/sessions', 'POST', { course_id: courseId, date });
    const session = await json(app, `/api/attendance/sessions/${created.body.id}`);
    for (const record of session.body.records) {
      const bobAbsent = record.student_id === bob && date > '2026-06-08';
      await json(app, `/api/attendance/records/${record.id}`, 'PUT', { status: bobAbsent ? 'absent' : 'present' });
    }
  }

  const analytics = await json(app, `/api/attendance/analytics/${courseId}`);
  assert.equal(analytics.body.sessions_count, 3);
  assert.equal(analytics.body.at_risk_count, 1);

  const alice = analytics.body.students.find((s: { name: string }) => s.name === 'Alice Steady');
  assert.equal(alice.at_risk, false);
  assert.equal(alice.attendance_rate, 100);
  assert.equal(alice.current_streak, 3);

  const bobRow = analytics.body.students.find((s: { name: string }) => s.name === 'Bob Fading');
  assert.equal(bobRow.at_risk, true);
  assert.ok(bobRow.risk_reasons.some((r: string) => r.includes('consecutive absences')));
  assert.ok(bobRow.risk_reasons.some((r: string) => r.includes('attendance')));
  // recent is most-recent-first
  assert.deepEqual(bobRow.recent, ['absent', 'absent', 'present']);

  assert.equal(analytics.body.sessions.length, 3);
  const lastSession = analytics.body.sessions[2];
  assert.equal(lastSession.date, '2026-06-10');
  assert.equal(lastSession.present, 1);
  assert.equal(lastSession.absent, 1);
});

test('analytics: no at-risk flags before three sessions', async () => {
  const app = makeApp();
  const { courseId } = await seedCourse(app, ['Carol New']);
  const created = await json(app, '/api/attendance/sessions', 'POST', { course_id: courseId, date: '2026-06-10' });
  const session = await json(app, `/api/attendance/sessions/${created.body.id}`);
  await json(app, `/api/attendance/records/${session.body.records[0].id}`, 'PUT', { status: 'absent' });

  const analytics = await json(app, `/api/attendance/analytics/${courseId}`);
  assert.equal(analytics.body.at_risk_count, 0);
});

test('OCR endpoint validation and FERPA guard', async () => {
  const app = makeApp();
  const { courseId } = await seedCourse(app, ['Maria Gonzalez']);
  const created = await json(app, '/api/attendance/sessions', 'POST', { course_id: courseId, date: '2026-06-10' });
  const sessionId = created.body.id;

  const noImage = await json(app, `/api/attendance/sessions/${sessionId}/ocr`, 'POST', {});
  assert.equal(noImage.status, 400);

  const badImage = await json(app, `/api/attendance/sessions/${sessionId}/ocr`, 'POST', { image: 'http://example.com/x.jpg' });
  assert.equal(badImage.status, 400);

  const noSession = await json(app, '/api/attendance/sessions/does-not-exist/ocr', 'POST', { image: VALID_IMAGE });
  assert.equal(noSession.status, 404);

  // Remote endpoint without override: blocked before any LLM call
  await json(app, '/api/config', 'PUT', { llm_endpoint: 'https://api.openai.com/v1' });
  const blocked = await json(app, `/api/attendance/sessions/${sessionId}/ocr`, 'POST', { image: VALID_IMAGE });
  assert.equal(blocked.status, 403);
  assert.match(blocked.body.error, /FERPA/);
  await json(app, '/api/config', 'PUT', { llm_endpoint: 'http://localhost:11434/v1' });
});
