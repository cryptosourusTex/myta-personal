import { Hono } from 'hono';
import { getDb } from '../db/index.js';
import { nanoid } from 'nanoid';

const canvasRoutes = new Hono();

function getCanvasConfig() {
  const db = getDb();
  const getVal = (key: string) => {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value || '';
  };
  return { domain: getVal('canvas_domain'), token: getVal('canvas_token') };
}

async function canvasFetch(path: string, domain: string, token: string) {
  const res = await fetch(`https://${domain}/api/v1${path}`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`Canvas API ${res.status}: ${res.statusText}`);
  return res.json();
}

// Sync courses and rosters from Canvas
canvasRoutes.post('/sync', async (c) => {
  const { domain, token } = getCanvasConfig();
  if (!domain || !token) {
    return c.json({ error: 'Canvas not configured' }, 400);
  }

  const db = getDb();
  const now = Date.now();

  try {
    const courses = await canvasFetch('/courses?enrollment_type=teacher&enrollment_state=active&per_page=50', domain, token);
    let studentsTotal = 0;

    const upsertCourse = db.prepare(
      'INSERT INTO course (id, name, term, canvas_url, synced_at) VALUES (?, ?, ?, ?, ?) ON CONFLICT(id) DO UPDATE SET name=?, term=?, synced_at=?'
    );
    const upsertStudent = db.prepare(
      `INSERT INTO student (id, course_id, name, email, section) VALUES (?, ?, ?, ?, ?)
       ON CONFLICT(id, course_id) DO UPDATE SET name=?, email=?`
    );

    for (const course of courses) {
      const cid = String(course.id);
      const name = course.name || 'Untitled';
      const term = course.enrollment_term_id ? String(course.enrollment_term_id) : null;
      const url = `https://${domain}/courses/${course.id}`;
      upsertCourse.run(cid, name, term, url, now, name, term, now);

      try {
        const enrollments = await canvasFetch(`/courses/${course.id}/enrollments?type[]=StudentEnrollment&per_page=100`, domain, token);
        for (const e of enrollments) {
          const sid = String(e.user_id);
          const sname = e.user?.name || e.user?.sortable_name || 'Unknown';
          const email = e.user?.email || e.user?.login_id || null;
          const section = e.course_section_id ? String(e.course_section_id) : null;
          upsertStudent.run(sid, cid, sname, email, section, sname, email);
          studentsTotal++;
        }
      } catch (err) {
        // Canvas enrollment sync failure for this course — degrade gracefully, skip roster
        process.stderr.write(`Canvas roster sync failed for course ${course.id}: ${err instanceof Error ? err.message : err}\n`);
      }
    }

    return c.json({
      courses_synced: courses.length,
      students_synced: studentsTotal,
      synced_at: now,
    });
  } catch (err) {
    // Return cached data info on failure
    const cached = db.prepare('SELECT COUNT(*) as count FROM course').get() as { count: number };
    const lastSync = db.prepare('SELECT MAX(synced_at) as ts FROM course').get() as { ts: number | null };
    return c.json({
      error: err instanceof Error ? err.message : String(err),
      cached_at: lastSync?.ts,
      courses_cached: cached.count,
    }, 502);
  }
});

// List courses
canvasRoutes.get('/courses', (c) => {
  const db = getDb();
  const courses = db.prepare(`
    SELECT c.*, COUNT(s.id) as student_count
    FROM course c LEFT JOIN student s ON s.course_id = c.id
    GROUP BY c.id ORDER BY c.name
  `).all();
  return c.json(courses);
});

// Get single course
canvasRoutes.get('/courses/:id', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const course = db.prepare('SELECT * FROM course WHERE id = ?').get(id);
  if (!course) return c.json({ error: 'Not found' }, 404);
  return c.json(course);
});

// Get students for a course
canvasRoutes.get('/courses/:id/students', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const students = db.prepare('SELECT * FROM student WHERE course_id = ? ORDER BY name').all(id);
  return c.json(students);
});

// Manual course creation
canvasRoutes.post('/courses', async (c) => {
  const { name, term } = await c.req.json();
  const db = getDb();
  const id = `manual_${nanoid()}`;
  db.prepare('INSERT INTO course (id, name, term, canvas_url, synced_at) VALUES (?, ?, ?, ?, ?)').run(id, name, term || null, null, Date.now());
  return c.json({ id, name });
});

// Manual student creation
canvasRoutes.post('/courses/:id/students', async (c) => {
  const courseId = c.req.param('id');
  const { name, email } = await c.req.json();
  const db = getDb();
  const id = `manual_${nanoid()}`;
  db.prepare('INSERT INTO student (id, course_id, name, email, section) VALUES (?, ?, ?, ?, ?)').run(id, courseId, name, email || null, null);
  return c.json({ id, name });
});

export default canvasRoutes;
