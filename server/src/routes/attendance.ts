import { Hono } from 'hono';
import { getDb } from '../db/index.js';
import { nanoid } from 'nanoid';

const attendanceRoutes = new Hono();

// Create attendance session
attendanceRoutes.post('/sessions', async (c) => {
  const { course_id, date } = await c.req.json();
  const db = getDb();
  const id = nanoid();
  const now = Date.now();

  db.prepare('INSERT INTO attendance_session (id, course_id, date, finalized, created_at) VALUES (?, ?, ?, 0, ?)').run(id, course_id, date, now);

  // Create attendance records for all students (default: absent)
  const students = db.prepare('SELECT * FROM student WHERE course_id = ?').all(course_id) as any[];
  const insert = db.prepare('INSERT INTO attendance_record (id, session_id, student_id, status, source, updated_at) VALUES (?, ?, ?, ?, ?, ?)');
  for (const s of students) {
    insert.run(nanoid(), id, s.id, 'absent', 'manual', now);
  }

  return c.json({ id, course_id, date, record_count: students.length });
});

// List sessions for course
attendanceRoutes.get('/sessions', (c) => {
  const courseId = c.req.query('course_id');
  const db = getDb();
  let sessions;
  if (courseId) {
    sessions = db.prepare('SELECT * FROM attendance_session WHERE course_id = ? ORDER BY date DESC').all(courseId);
  } else {
    sessions = db.prepare('SELECT * FROM attendance_session ORDER BY date DESC').all();
  }
  return c.json(sessions);
});

// Get session with records
attendanceRoutes.get('/sessions/:id', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const session = db.prepare('SELECT * FROM attendance_session WHERE id = ?').get(id) as any;
  if (!session) return c.json({ error: 'Not found' }, 404);

  const records = db.prepare(`
    SELECT ar.*, s.name as student_name, s.email as student_email
    FROM attendance_record ar
    JOIN student s ON s.id = ar.student_id
    WHERE ar.session_id = ?
    ORDER BY s.name
  `).all(id);

  return c.json({ ...session, records });
});

// Update attendance record
attendanceRoutes.put('/records/:id', async (c) => {
  const id = c.req.param('id');
  const { status, note, source } = await c.req.json();
  const db = getDb();
  db.prepare('UPDATE attendance_record SET status = ?, note = ?, source = ?, updated_at = ? WHERE id = ?')
    .run(status, note || null, source || 'manual', Date.now(), id);
  return c.json({ updated: id });
});

// Finalize session
attendanceRoutes.post('/sessions/:id/finalize', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  db.prepare('UPDATE attendance_session SET finalized = 1 WHERE id = ?').run(id);
  db.prepare('INSERT INTO audit_log (id, action, entity_type, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(nanoid(), 'attendance_finalized', 'attendance_session', id, null, Date.now());
  return c.json({ finalized: id });
});

// Export CSV
attendanceRoutes.get('/sessions/:id/export', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const records = db.prepare(`
    SELECT s.name, s.id as student_id, ar.status, ar.note, ass.date
    FROM attendance_record ar
    JOIN student s ON s.id = ar.student_id
    JOIN attendance_session ass ON ass.id = ar.session_id
    WHERE ar.session_id = ?
    ORDER BY s.name
  `).all(id) as any[];

  const csv = ['student_name,student_id,date,status,note'];
  for (const r of records) {
    csv.push(`"${r.name}","${r.student_id}","${r.date}","${r.status}","${r.note || ''}"`);
  }

  return new Response(csv.join('\n'), {
    headers: {
      'Content-Type': 'text/csv',
      'Content-Disposition': `attachment; filename="attendance-${id}.csv"`,
    },
  });
});

// Voice command processing
attendanceRoutes.post('/sessions/:id/voice', async (c) => {
  const sessionId = c.req.param('id');
  const { command } = await c.req.json();
  const db = getDb();

  const records = db.prepare(`
    SELECT ar.id, ar.student_id, s.name
    FROM attendance_record ar
    JOIN student s ON s.id = ar.student_id
    WHERE ar.session_id = ?
  `).all(sessionId) as any[];

  const cmd = command.toLowerCase().trim();
  const actions: any[] = [];
  const unmatched: string[] = [];
  const now = Date.now();

  // "everyone present"
  if (cmd.includes('everyone present') || cmd.includes('all present')) {
    const exceptMatch = cmd.match(/except\s+(.+)/i);
    const exceptName = exceptMatch?.[1]?.trim();

    for (const r of records) {
      if (exceptName && fuzzyMatch(r.name, exceptName) < 3) {
        db.prepare('UPDATE attendance_record SET status = ?, source = ?, updated_at = ? WHERE id = ?').run('absent', 'voice', now, r.id);
        actions.push({ student_id: r.student_id, name: r.name, new_status: 'absent' });
      } else {
        db.prepare('UPDATE attendance_record SET status = ?, source = ?, updated_at = ? WHERE id = ?').run('present', 'voice', now, r.id);
        actions.push({ student_id: r.student_id, name: r.name, new_status: 'present' });
      }
    }
    return c.json({ actions_taken: actions, unmatched });
  }

  // "mark [name] [status]"
  const markMatch = cmd.match(/mark\s+(.+?)\s+(present|absent|late|excused)/i);
  if (markMatch) {
    const targetName = markMatch[1].trim();
    const targetStatus = markMatch[2].toLowerCase();

    let bestMatch: any = null;
    let bestDist = Infinity;
    for (const r of records) {
      const dist = fuzzyMatch(r.name, targetName);
      if (dist < bestDist) {
        bestDist = dist;
        bestMatch = r;
      }
    }

    if (bestMatch && bestDist < 3) {
      db.prepare('UPDATE attendance_record SET status = ?, source = ?, updated_at = ? WHERE id = ?').run(targetStatus, 'voice', now, bestMatch.id);
      actions.push({ student_id: bestMatch.student_id, name: bestMatch.name, new_status: targetStatus });
    } else {
      unmatched.push(targetName);
    }
    return c.json({ actions_taken: actions, unmatched });
  }

  // "note [text]"
  if (cmd.startsWith('note ')) {
    const noteText = command.slice(5).trim();
    const session = db.prepare('SELECT notes FROM attendance_session WHERE id = ?').get(sessionId) as any;
    const existing = session?.notes || '';
    const updated = existing ? `${existing}\n${noteText}` : noteText;
    db.prepare('UPDATE attendance_session SET notes = ? WHERE id = ?').run(updated, sessionId);
    return c.json({ actions_taken: [{ action: 'note_added', text: noteText }], unmatched });
  }

  return c.json({ actions_taken: [], unmatched: [command] });
});

// Levenshtein distance for fuzzy name matching
function fuzzyMatch(a: string, b: string): number {
  a = a.toLowerCase();
  b = b.toLowerCase();
  const m = a.length, n = b.length;
  const dp: number[][] = Array.from({ length: m + 1 }, () => Array(n + 1).fill(0));
  for (let i = 0; i <= m; i++) dp[i][0] = i;
  for (let j = 0; j <= n; j++) dp[0][j] = j;
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = a[i - 1] === b[j - 1]
        ? dp[i - 1][j - 1]
        : 1 + Math.min(dp[i - 1][j], dp[i][j - 1], dp[i - 1][j - 1]);
    }
  }
  return dp[m][n];
}

export default attendanceRoutes;
