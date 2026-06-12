import { Hono } from 'hono';
import { getDb } from '../db/index.js';
import { getConfig } from '../config.js';
import { nanoid } from 'nanoid';
import OpenAI from 'openai';

interface AttendanceRecord {
  id: string;
  student_id: string;
  session_id: string;
  status: string;
  note: string | null;
  source: string;
  updated_at: number;
  student_name?: string;
  student_email?: string;
  name?: string;
  date?: string;
}

interface AttendanceSession {
  id: string;
  course_id: string;
  date: string;
  notes: string | null;
  finalized: number;
  created_at: number;
}

interface StudentRow {
  id: string;
  name: string;
  email: string | null;
  course_id: string;
}

interface SessionRow {
  id: string;
  date: string;
}

const attendanceRoutes = new Hono();

// Create attendance session
attendanceRoutes.post('/sessions', async (c) => {
  const { course_id, date } = await c.req.json();
  const db = getDb();
  const id = nanoid();
  const now = Date.now();

  db.prepare('INSERT INTO attendance_session (id, course_id, date, finalized, created_at) VALUES (?, ?, ?, 0, ?)').run(id, course_id, date, now);

  // Create attendance records for all students (default: absent)
  const students = db.prepare('SELECT * FROM student WHERE course_id = ?').all(course_id) as StudentRow[];
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
  const session = db.prepare('SELECT * FROM attendance_session WHERE id = ?').get(id) as AttendanceSession | undefined;
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
  `).all(id) as AttendanceRecord[];

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
  `).all(sessionId) as AttendanceRecord[];

  const cmd = command.toLowerCase().trim();
  const actions: Array<{ student_id?: string; name?: string; new_status?: string; action?: string; text?: string }> = [];
  const unmatched: string[] = [];
  const now = Date.now();

  // "everyone present"
  if (cmd.includes('everyone present') || cmd.includes('all present')) {
    const exceptMatch = cmd.match(/except\s+(.+)/i);
    const exceptName = exceptMatch?.[1]?.trim();

    for (const r of records) {
      if (exceptName && fuzzyMatch(r.name ?? '', exceptName) < 3) {
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

    let bestMatch: AttendanceRecord | null = null;
    let bestDist = Infinity;
    for (const r of records) {
      const dist = fuzzyMatch(r.name ?? '', targetName);
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
    const session = db.prepare('SELECT notes FROM attendance_session WHERE id = ?').get(sessionId) as AttendanceSession | undefined;
    const existing = session?.notes || '';
    const updated = existing ? `${existing}\n${noteText}` : noteText;
    db.prepare('UPDATE attendance_session SET notes = ? WHERE id = ?').run(updated, sessionId);
    return c.json({ actions_taken: [{ action: 'note_added', text: noteText }], unmatched });
  }

  return c.json({ actions_taken: [], unmatched: [command] });
});

// Photo OCR of a sign-in sheet: extract names with a vision model, propose
// roster matches. Does NOT modify records — the professor confirms in the UI.
attendanceRoutes.post('/sessions/:id/ocr', async (c) => {
  const sessionId = c.req.param('id');
  const { image } = await c.req.json();
  if (!image || typeof image !== 'string' || !image.startsWith('data:image/')) {
    return c.json({ error: 'image must be a data URL (data:image/...)' }, 400);
  }
  const db = getDb();

  const session = db.prepare('SELECT id FROM attendance_session WHERE id = ?').get(sessionId);
  if (!session) return c.json({ error: 'Session not found' }, 404);

  const records = db.prepare(`
    SELECT ar.id, ar.student_id, s.name
    FROM attendance_record ar
    JOIN student s ON s.id = ar.student_id
    WHERE ar.session_id = ?
    ORDER BY s.name
  `).all(sessionId) as AttendanceRecord[];
  if (records.length === 0) return c.json({ error: 'Session has no roster records' }, 400);

  const getVal = (key: string) => {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  };
  const endpoint = getVal('llm_endpoint') || getConfig().llm.endpoint;
  const visionModel = getVal('vision_model') || getVal('llm_model') || getConfig().llm.model;
  const textModel = getVal('llm_model') || getConfig().llm.model;
  const apiKey = getVal('llm_api_key') || getConfig().llm.api_key || 'none';
  const client = new OpenAI({ baseURL: endpoint, apiKey });

  let rawText: string;
  try {
    const visionResponse = await client.chat.completions.create({
      model: visionModel,
      messages: [{
        role: 'user',
        content: [
          { type: 'text', text: 'This is a photo of a class sign-in sheet with handwritten names. List every name you can read, one per line. Output only the names — no numbering, no commentary. If a line is illegible, skip it.' },
          { type: 'image_url', image_url: { url: image } },
        ],
      }],
      max_tokens: 1000,
      temperature: 0,
    });
    rawText = visionResponse.choices[0]?.message?.content || '';
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Vision model failed: ${message}. Is a vision-capable model (e.g. llama3.2-vision) configured?` }, 502);
  }

  if (!rawText.trim()) {
    return c.json({ extracted: [], matches: [], unmatched: [], model: visionModel });
  }

  // Vision models rarely honor "one per line" — they return prose, comma
  // lists, quotes, commentary. The text model gets the raw output and does
  // extraction + roster matching in one pass; crude splitting is the fallback.
  const roster = records.map((r) => r.name ?? '');
  let llmPairs: Array<{ extracted: string; roster_name: string | null; confidence: string }> | null = null;
  try {
    const matchResponse = await client.chat.completions.create({
      model: textModel,
      messages: [{
        role: 'user',
        content: `Below is raw OCR output from a photo of a handwritten class sign-in sheet, followed by the class roster. Extract every student name from the OCR output and match it to the roster. Handwriting OCR is noisy: expect misspellings, partial names, nicknames (e.g. "Mike" for "Michael"), accents added or dropped, and surrounding commentary that is not a name.

Raw OCR output:
"""
${rawText}
"""

Roster:
${roster.map((n) => `- ${n}`).join('\n')}

Reply with ONLY a JSON array, one object per name found in the OCR output:
[{"extracted": "...", "roster_name": "..." or null, "confidence": "high" | "medium" | "low"}]
"extracted" is the name as it appears on the sheet. Use null for roster_name when no roster entry plausibly matches. Never match one roster name to two extracted names unless the sheet truly repeats it. Ignore OCR text that is clearly not a name (titles, dates, commentary).`,
      }],
      max_tokens: 1500,
      temperature: 0,
    });
    const text = matchResponse.choices[0]?.message?.content || '';
    const jsonMatch = text.match(/\[[\s\S]*\]/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]) as Array<{ extracted: string; roster_name: string | null; confidence: string }>;
      llmPairs = parsed
        .filter((p) => p && typeof p.extracted === 'string' && p.extracted.trim().length > 1)
        .map((p) => ({
          extracted: p.extracted.trim(),
          roster_name: typeof p.roster_name === 'string' ? p.roster_name : null,
          confidence: ['high', 'medium', 'low'].includes(p.confidence) ? p.confidence : 'low',
        }));
    }
  } catch {
    llmPairs = null;
  }

  // Fallback when the matching call fails: split the raw text into name-like
  // fragments and Levenshtein-match against the roster.
  const candidates: Array<{ extracted: string; roster_name: string | null; confidence: string }> = llmPairs ?? rawText
    .split(/\n|,|\band\b|;/)
    .map((s) => s.replace(/^[\s\d.\-*•"']+|[\s"'.]+$/g, '').trim())
    .filter((s) => s.length > 1 && s.length < 60)
    .map((s) => ({ extracted: s, roster_name: null, confidence: 'fallback' }));

  const matches: Array<{ extracted_name: string; record_id: string; student_id: string; student_name: string; confidence: string }> = [];
  const unmatched: string[] = [];
  const claimed = new Set<string>();
  const extracted = candidates.map((p) => p.extracted);

  for (const pair of candidates) {
    let target: AttendanceRecord | undefined;
    let confidence = 'low';

    if (pair.roster_name) {
      target = records.find((r) => r.name === pair.roster_name && !claimed.has(r.id));
      if (target) confidence = pair.confidence;
    }
    if (!target) {
      target = records.find((r) =>
        !claimed.has(r.id) && (r.name ?? '').length > 4 &&
        pair.extracted.toLowerCase().includes((r.name ?? '').toLowerCase()));
      if (target) confidence = 'high';
    }
    if (!target) {
      let bestDist = Infinity;
      let best: AttendanceRecord | undefined;
      for (const r of records) {
        if (claimed.has(r.id)) continue;
        const dist = fuzzyMatch(r.name ?? '', pair.extracted);
        if (dist < bestDist) { bestDist = dist; best = r; }
      }
      if (best && bestDist <= 3) {
        target = best;
        confidence = bestDist <= 1 ? 'high' : 'medium';
      }
    }

    if (target) {
      claimed.add(target.id);
      matches.push({ extracted_name: pair.extracted, record_id: target.id, student_id: target.student_id, student_name: target.name ?? '', confidence });
    } else {
      unmatched.push(pair.extracted);
    }
  }

  db.prepare('INSERT INTO audit_log (id, action, entity_type, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(nanoid(), 'attendance_ocr', 'attendance_session', sessionId, `extracted=${extracted.length} matched=${matches.length} unmatched=${unmatched.length} model=${visionModel}`, Date.now());

  return c.json({ extracted, matches, unmatched, model: visionModel });
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

// Attendance analytics for a course
attendanceRoutes.get('/analytics/:courseId', (c) => {
  const courseId = c.req.param('courseId');
  const db = getDb();

  // Get all sessions for the course
  const sessions = db.prepare(
    'SELECT id, date FROM attendance_session WHERE course_id = ? ORDER BY date'
  ).all(courseId) as SessionRow[];

  if (sessions.length === 0) {
    return c.json({ sessions_count: 0, students: [], session_dates: [] });
  }

  // Get all students
  const students = db.prepare('SELECT id, name FROM student WHERE course_id = ? ORDER BY name').all(courseId) as StudentRow[];

  // Get all records for sessions in this course via join (avoids dynamic IN clause)
  const records = db.prepare(`
    SELECT ar.student_id, ar.status, ass.date
    FROM attendance_record ar
    JOIN attendance_session ass ON ass.id = ar.session_id
    WHERE ass.course_id = ?
  `).all(courseId) as AttendanceRecord[];

  // Build per-student analytics
  const studentAnalytics = students.map((student: StudentRow) => {
    const studentRecords = records.filter((r: AttendanceRecord) => r.student_id === student.id);
    const counts = { present: 0, absent: 0, late: 0, excused: 0 };
    for (const r of studentRecords) {
      if (r.status in counts) counts[r.status as keyof typeof counts]++;
    }
    const total = studentRecords.length || 1;
    const attendanceRate = ((counts.present + counts.late + counts.excused) / total * 100).toFixed(1);

    // Calculate current streak (consecutive present/late from most recent)
    const sorted = studentRecords.sort((a: AttendanceRecord, b: AttendanceRecord) => (b.date ?? '').localeCompare(a.date ?? ''));
    let streak = 0;
    for (const r of sorted) {
      if (r.status === 'present' || r.status === 'late') streak++;
      else break;
    }

    return {
      id: student.id,
      name: student.name,
      ...counts,
      attendance_rate: parseFloat(attendanceRate),
      current_streak: streak,
    };
  });

  // Course-level summary
  const totalPresent = studentAnalytics.reduce((sum, s) => sum + s.present, 0);
  const totalRecords = records.length || 1;
  const courseRate = ((records.filter((r: AttendanceRecord) => r.status === 'present' || r.status === 'late' || r.status === 'excused').length / totalRecords) * 100).toFixed(1);

  return c.json({
    sessions_count: sessions.length,
    session_dates: sessions.map((s: SessionRow) => s.date),
    course_attendance_rate: parseFloat(courseRate),
    students: studentAnalytics,
  });
});

export default attendanceRoutes;
