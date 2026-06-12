import { test } from 'node:test';
import assert from 'node:assert/strict';
import { makeApp, json, seedCourse } from './helpers.js';

function fileForm(name: string, content: string, type = 'text/plain'): FormData {
  const fd = new FormData();
  fd.append('file', new Blob([content], { type }), name);
  return fd;
}

test('extract-text handles plain text and markdown', async () => {
  const app = makeApp();

  const txt = await app.request('/api/grading/extract-text', { method: 'POST', body: fileForm('essay.txt', 'A fine essay.\r\n\r\n\r\n\r\nWith spacing quirks.') });
  assert.equal(txt.status, 200);
  const txtBody = await txt.json();
  assert.equal(txtBody.name, 'essay.txt');
  // CRLF normalized, 3+ newlines collapsed
  assert.equal(txtBody.text, 'A fine essay.\n\nWith spacing quirks.');
  assert.equal(txtBody.chars, txtBody.text.length);

  const md = await app.request('/api/grading/extract-text', { method: 'POST', body: fileForm('notes.md', '# Heading\n\nBody text.') });
  assert.equal(md.status, 200);
  assert.match((await md.json()).text, /Heading/);
});

test('extract-text rejects unsupported, legacy, empty, and missing files', async () => {
  const app = makeApp();

  const missing = await app.request('/api/grading/extract-text', { method: 'POST', body: new FormData() });
  assert.equal(missing.status, 400);

  const legacy = await app.request('/api/grading/extract-text', { method: 'POST', body: fileForm('old.doc', 'x', 'application/msword') });
  assert.equal(legacy.status, 415);
  assert.match((await legacy.json()).error, /docx or PDF/);

  const image = await app.request('/api/grading/extract-text', { method: 'POST', body: fileForm('photo.jpg', 'x', 'image/jpeg') });
  assert.equal(image.status, 415);

  const empty = await app.request('/api/grading/extract-text', { method: 'POST', body: fileForm('empty.txt', '   \n  ') });
  assert.equal(empty.status, 422);
});

test('rubric, assignment, grading session, and queue lifecycle', async () => {
  const app = makeApp();
  const { courseId } = await seedCourse(app, ['Maria Gonzalez', 'James Okafor']);

  const rubric = await json(app, '/api/rubrics', 'POST', {
    name: 'Essay rubric',
    course_id: courseId,
    criteria: [
      { title: 'Thesis', description: 'Clear arguable thesis', points_possible: 10 },
      { title: 'Evidence', description: 'Supports claims', points_possible: 15 },
    ],
  });
  assert.equal(rubric.status, 200);

  const fetched = await json(app, `/api/rubrics/${rubric.body.id}`);
  assert.equal(fetched.body.criteria.length, 2);

  const assignment = await json(app, '/api/assignments', 'POST', { name: 'Essay 1', course_id: courseId, rubric_id: rubric.body.id });
  const session = await json(app, '/api/grading/sessions', 'POST', { assignment_id: assignment.body.id });
  assert.equal(session.status, 200);
  // 2 students x 2 criteria
  assert.equal(session.body.grade_items_created, 4);

  const queue = await json(app, `/api/grading/sessions/${session.body.id}/queue`);
  assert.equal(queue.body.length, 2);
  assert.ok(queue.body.every((q: { grading_status: string }) => q.grading_status === 'pending'));

  const noRubricAssignment = await json(app, '/api/assignments', 'POST', { name: 'No rubric', course_id: courseId });
  const badSession = await json(app, '/api/grading/sessions', 'POST', { assignment_id: noRubricAssignment.body.id });
  assert.equal(badSession.status, 400);
});

test('AI suggestions are FERPA-guarded against remote endpoints', async () => {
  const app = makeApp();
  const { courseId, studentIds } = await seedCourse(app, ['Maria Gonzalez']);
  const rubric = await json(app, '/api/rubrics', 'POST', { name: 'R', course_id: courseId, criteria: [{ title: 'T', points_possible: 5 }] });
  const assignment = await json(app, '/api/assignments', 'POST', { name: 'A', course_id: courseId, rubric_id: rubric.body.id });
  const session = await json(app, '/api/grading/sessions', 'POST', { assignment_id: assignment.body.id });

  await json(app, '/api/config', 'PUT', { llm_endpoint: 'https://api.openai.com/v1' });
  const blocked = await json(app, `/api/grading/sessions/${session.body.id}/suggest/${studentIds[0]}`, 'POST', { submission_text: 'My essay.' });
  assert.equal(blocked.status, 403);
  assert.match(blocked.body.error, /FERPA/);
});
