import { Hono } from 'hono';
import { getDb } from '../db/index.js';
import { getConfig } from '../config.js';
import { nanoid } from 'nanoid';
import OpenAI from 'openai';

const gradingRoutes = new Hono();

// ---- Rubrics ----

gradingRoutes.post('/rubrics', async (c) => {
  const { name, course_id, criteria } = await c.req.json();
  const db = getDb();
  const id = nanoid();
  const now = Date.now();
  db.prepare('INSERT INTO rubric (id, name, course_id, created_at) VALUES (?, ?, ?, ?)').run(id, name, course_id || null, now);

  if (criteria && Array.isArray(criteria)) {
    const ins = db.prepare('INSERT INTO rubric_criterion (id, rubric_id, title, description, points_possible, sort_order) VALUES (?, ?, ?, ?, ?, ?)');
    criteria.forEach((cr: any, i: number) => {
      ins.run(nanoid(), id, cr.title, cr.description || null, cr.points_possible, i);
    });
  }

  return c.json({ id, name });
});

gradingRoutes.get('/rubrics', (c) => {
  const courseId = c.req.query('course_id');
  const db = getDb();
  let rubrics;
  if (courseId) {
    rubrics = db.prepare('SELECT * FROM rubric WHERE course_id = ? OR course_id IS NULL ORDER BY created_at DESC').all(courseId);
  } else {
    rubrics = db.prepare('SELECT * FROM rubric ORDER BY created_at DESC').all();
  }
  return c.json(rubrics);
});

gradingRoutes.get('/rubrics/:id', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const rubric = db.prepare('SELECT * FROM rubric WHERE id = ?').get(id) as any;
  if (!rubric) return c.json({ error: 'Not found' }, 404);
  const criteria = db.prepare('SELECT * FROM rubric_criterion WHERE rubric_id = ? ORDER BY sort_order').all(id);
  return c.json({ ...rubric, criteria });
});

// ---- Assignments ----

gradingRoutes.post('/assignments', async (c) => {
  const { name, course_id, rubric_id, points_possible } = await c.req.json();
  const db = getDb();
  const id = nanoid();
  db.prepare('INSERT INTO assignment (id, course_id, name, rubric_id, points_possible, created_at) VALUES (?, ?, ?, ?, ?, ?)').run(id, course_id, name, rubric_id || null, points_possible || null, Date.now());
  return c.json({ id, name });
});

gradingRoutes.get('/assignments', (c) => {
  const courseId = c.req.query('course_id');
  const db = getDb();
  const rows = courseId
    ? db.prepare('SELECT * FROM assignment WHERE course_id = ? ORDER BY created_at DESC').all(courseId)
    : db.prepare('SELECT * FROM assignment ORDER BY created_at DESC').all();
  return c.json(rows);
});

// ---- Grading Sessions ----

gradingRoutes.post('/grading/sessions', async (c) => {
  const { assignment_id } = await c.req.json();
  const db = getDb();
  const id = nanoid();
  const now = Date.now();

  const assignment = db.prepare('SELECT * FROM assignment WHERE id = ?').get(assignment_id) as any;
  if (!assignment) return c.json({ error: 'Assignment not found' }, 404);
  if (!assignment.rubric_id) return c.json({ error: 'Assignment has no rubric' }, 400);

  db.prepare('INSERT INTO grading_session (id, assignment_id, status, created_at) VALUES (?, ?, ?, ?)').run(id, assignment_id, 'active', now);

  const students = db.prepare('SELECT * FROM student WHERE course_id = ?').all(assignment.course_id) as any[];
  const criteria = db.prepare('SELECT * FROM rubric_criterion WHERE rubric_id = ? ORDER BY sort_order').all(assignment.rubric_id) as any[];

  const ins = db.prepare(
    'INSERT INTO grade_item (id, session_id, student_id, criterion_id, status, updated_at) VALUES (?, ?, ?, ?, ?, ?)'
  );
  let count = 0;
  for (const s of students) {
    for (const cr of criteria) {
      ins.run(nanoid(), id, s.id, cr.id, 'pending', now);
      count++;
    }
  }

  return c.json({ id, grade_items_created: count });
});

gradingRoutes.get('/grading/sessions/:id', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const session = db.prepare('SELECT * FROM grading_session WHERE id = ?').get(id) as any;
  if (!session) return c.json({ error: 'Not found' }, 404);

  const assignment = db.prepare('SELECT * FROM assignment WHERE id = ?').get(session.assignment_id) as any;
  const rubric = assignment?.rubric_id
    ? db.prepare('SELECT * FROM rubric WHERE id = ?').get(assignment.rubric_id)
    : null;
  const criteria = assignment?.rubric_id
    ? db.prepare('SELECT * FROM rubric_criterion WHERE rubric_id = ? ORDER BY sort_order').all(assignment.rubric_id)
    : [];

  return c.json({ ...session, assignment, rubric, criteria });
});

// Queue: list students with their status
gradingRoutes.get('/grading/sessions/:id/queue', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const session = db.prepare('SELECT * FROM grading_session WHERE id = ?').get(id) as any;
  if (!session) return c.json({ error: 'Not found' }, 404);

  const assignment = db.prepare('SELECT * FROM assignment WHERE id = ?').get(session.assignment_id) as any;
  const students = db.prepare('SELECT * FROM student WHERE course_id = ? ORDER BY name').all(assignment.course_id) as any[];

  const queue = students.map((s: any) => {
    const items = db.prepare('SELECT status FROM grade_item WHERE session_id = ? AND student_id = ?').all(id, s.id) as any[];
    const total = items.length;
    const approved = items.filter((i: any) => i.status === 'approved').length;
    const suggested = items.filter((i: any) => i.status === 'suggested').length;
    let status = 'pending';
    if (approved === total && total > 0) status = 'complete';
    else if (suggested > 0 || approved > 0) status = 'in_progress';
    return { ...s, grading_status: status, items_total: total, items_approved: approved };
  });

  return c.json(queue);
});

// Get grade items for a student in a session
gradingRoutes.get('/grading/items', (c) => {
  const sessionId = c.req.query('session_id');
  const studentId = c.req.query('student_id');
  const db = getDb();
  const items = db.prepare(`
    SELECT gi.*, rc.title as criterion_title, rc.description as criterion_description, rc.points_possible
    FROM grade_item gi
    JOIN rubric_criterion rc ON rc.id = gi.criterion_id
    WHERE gi.session_id = ? AND gi.student_id = ?
    ORDER BY rc.sort_order
  `).all(sessionId, studentId);
  return c.json(items);
});

// AI suggestion
gradingRoutes.post('/grading/sessions/:sessionId/suggest/:studentId', async (c) => {
  const { sessionId, studentId } = c.req.param();
  const { submission_text } = await c.req.json();
  const db = getDb();

  const session = db.prepare('SELECT * FROM grading_session WHERE id = ?').get(sessionId) as any;
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const assignment = db.prepare('SELECT * FROM assignment WHERE id = ?').get(session.assignment_id) as any;
  const criteria = db.prepare('SELECT * FROM rubric_criterion WHERE rubric_id = ? ORDER BY sort_order').all(assignment.rubric_id) as any[];

  // Get LLM config
  const getVal = (key: string) => {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  };
  const endpoint = getVal('llm_endpoint') || getConfig().llm.endpoint;
  const model = getVal('llm_model') || getConfig().llm.model;
  const apiKey = getVal('llm_api_key') || getConfig().llm.api_key || 'none';

  const client = new OpenAI({ baseURL: endpoint, apiKey });
  const suggestions: any[] = [];

  for (const cr of criteria) {
    const prompt = `You are assisting a professor with grading. Be direct. Apply the rubric as written.

Criterion: ${cr.title} — ${cr.description || ''} (${cr.points_possible} points possible)

Student submission:
${submission_text}

Provide your response in this exact format:
Suggested score: [number 0 to ${cr.points_possible}]
Comment: [2-3 sentences explaining the score]
Supporting passage: [specific text from submission, or 'none identified']`;

    try {
      const response = await client.chat.completions.create({
        model,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 500,
      });

      const text = response.choices[0]?.message?.content || '';
      const scoreMatch = text.match(/Suggested score:\s*(\d+(?:\.\d+)?)/i);
      const commentMatch = text.match(/Comment:\s*(.+?)(?=Supporting passage:|$)/is);
      const passageMatch = text.match(/Supporting passage:\s*(.+)/is);

      const suggestedScore = scoreMatch ? parseFloat(scoreMatch[1]) : null;
      const suggestedComment = commentMatch ? commentMatch[1].trim() : text;
      const suggestedPassage = passageMatch ? passageMatch[1].trim() : null;

      // WRITE audit_log FIRST
      const auditId = nanoid();
      db.prepare('INSERT INTO audit_log (id, action, entity_type, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
        .run(auditId, 'ai_suggestion_generated', 'grade_item', `${sessionId}:${studentId}:${cr.id}`, JSON.stringify({ model, endpoint, criterion_id: cr.id }), Date.now());

      // ONLY AFTER audit write: update grade_item
      db.prepare(`UPDATE grade_item SET
        suggested_score = ?, suggested_comment = ?, suggested_passage = ?,
        ai_model = ?, ai_endpoint = ?, status = 'suggested', updated_at = ?
        WHERE session_id = ? AND student_id = ? AND criterion_id = ?`
      ).run(suggestedScore, suggestedComment, suggestedPassage, model, endpoint, Date.now(), sessionId, studentId, cr.id);

      suggestions.push({ criterion_id: cr.id, suggested_score: suggestedScore, suggested_comment: suggestedComment, suggested_passage: suggestedPassage });
    } catch (err: any) {
      return c.json({ error: 'degraded', message: `AI suggestion could not be generated: ${err.message}` }, 500);
    }
  }

  return c.json({ suggestions });
});

// Update grade item (professor edits)
gradingRoutes.put('/grading/items/:id', async (c) => {
  const id = c.req.param('id');
  const { professor_score, professor_comment } = await c.req.json();
  const db = getDb();
  db.prepare('UPDATE grade_item SET professor_score = ?, professor_comment = ?, updated_at = ? WHERE id = ?')
    .run(professor_score, professor_comment, Date.now(), id);
  return c.json({ updated: id });
});

// Approve grade item — ONLY path to final_score
gradingRoutes.post('/grading/items/:id/approve', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const item = db.prepare('SELECT * FROM grade_item WHERE id = ?').get(id) as any;
  if (!item) return c.json({ error: 'Not found' }, 404);

  if (item.professor_score === null) {
    return c.json({ error: 'Professor score is required before approval' }, 400);
  }

  // Write final_score from professor values
  db.prepare(`UPDATE grade_item SET
    final_score = ?, final_comment = ?, status = 'approved', updated_at = ?
    WHERE id = ?`
  ).run(item.professor_score, item.professor_comment, Date.now(), id);

  // Audit
  db.prepare('INSERT INTO audit_log (id, action, entity_type, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(nanoid(), 'grade_approved', 'grade_item', id, JSON.stringify({
      professor_score: item.professor_score,
      changed_from_suggestion: item.professor_score !== item.suggested_score,
    }), Date.now());

  return c.json({ approved: id, final_score: item.professor_score });
});

// Export grades CSV — ONLY final_score, ONLY approved items
gradingRoutes.get('/grading/sessions/:id/export', (c) => {
  const id = c.req.param('id');
  const db = getDb();

  const items = db.prepare(`
    SELECT s.name, s.email, rc.title as criterion, gi.final_score, gi.final_comment, gi.status
    FROM grade_item gi
    JOIN student s ON s.id = gi.student_id
    JOIN rubric_criterion rc ON rc.id = gi.criterion_id
    WHERE gi.session_id = ? AND gi.status = 'approved'
    ORDER BY s.name, rc.sort_order
  `).all(id) as any[];

  // Check for unapproved
  const unapproved = db.prepare("SELECT COUNT(*) as count FROM grade_item WHERE session_id = ? AND status != 'approved'").get(id) as any;

  const csv = ['student_name,student_email,criterion,final_score,final_comment'];
  for (const item of items) {
    csv.push(`"${item.name}","${item.email || ''}","${item.criterion}",${item.final_score},"${item.final_comment || ''}"`);
  }

  return new Response(csv.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="grades-${id}.csv"`,
      'X-Unapproved-Count': String(unapproved.count),
    },
  });
});

export default gradingRoutes;
