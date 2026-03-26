import { Hono } from 'hono';
import type { Env } from '../index';
import { CanvasClient } from '../lib/canvas-api';

const canvas = new Hono<{ Bindings: Env }>();

/**
 * POST /api/canvas/sync
 * Full sync: courses → students → assignments → rubrics.
 * Canvas token is sent encrypted from client; for now we accept
 * the plaintext token in x-canvas-token header (client decrypts before calling).
 */
canvas.post('/sync', async (c) => {
  // Get Canvas credentials
  const user = await c.env.DB.prepare('SELECT * FROM user WHERE id = ?')
    .bind('me')
    .first();

  if (!user?.canvas_domain) {
    return c.json({ error: 'Canvas not configured. Set domain in settings.' }, 400);
  }

  // Client sends decrypted token in header
  const token = c.req.header('x-canvas-token');
  if (!token) {
    return c.json({ error: 'Canvas token required. Send decrypted token in x-canvas-token header.' }, 401);
  }

  const client = new CanvasClient(user.canvas_domain as string, token);
  const now = Date.now();

  const summary = {
    courses: 0,
    students: 0,
    assignments: 0,
    rubrics: 0,
    errors: [] as string[],
  };

  try {
    // 1. Sync courses
    const courses = await client.getCourses();
    for (const course of courses) {
      const courseId = String(course.id);
      const termName = course.term?.name || null;

      // Get section count
      let sectionCount = 1;
      try {
        const sections = await client.getSections(courseId);
        sectionCount = sections.length || 1;
      } catch {
        // Non-critical — use default
      }

      await c.env.DB.prepare(
        `INSERT INTO course (id, name, term, section_count, synced_at)
         VALUES (?, ?, ?, ?, ?)
         ON CONFLICT(id) DO UPDATE SET
           name = excluded.name,
           term = excluded.term,
           section_count = excluded.section_count,
           synced_at = excluded.synced_at`,
      )
        .bind(courseId, course.name, termName, sectionCount, now)
        .run();

      summary.courses++;

      // 2. Sync students for this course
      try {
        const enrollments = await client.getStudents(courseId);
        for (const enrollment of enrollments) {
          const studentId = String(enrollment.user.id);
          await c.env.DB.prepare(
            `INSERT INTO student (id, course_id, name, email, canvas_section)
             VALUES (?, ?, ?, ?, ?)
             ON CONFLICT(id, course_id) DO UPDATE SET
               name = excluded.name,
               email = excluded.email,
               canvas_section = excluded.canvas_section`,
          )
            .bind(
              studentId,
              courseId,
              enrollment.user.name,
              enrollment.user.email || null,
              String(enrollment.course_section_id),
            )
            .run();
          summary.students++;
        }
      } catch (e: any) {
        summary.errors.push(`Students for ${course.name}: ${e.message}`);
      }

      // 3. Sync assignments for this course
      try {
        const assignments = await client.getAssignments(courseId);
        for (const assignment of assignments) {
          const assignmentId = String(assignment.id);
          let rubricId: string | null = null;

          // If assignment has a rubric, sync it
          if (assignment.rubric_settings?.id) {
            try {
              const rubric = await client.getRubric(courseId, assignment.rubric_settings.id);
              rubricId = String(rubric.id);

              await c.env.DB.prepare(
                `INSERT INTO rubric (id, name, assignment_id, created_at)
                 VALUES (?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                   name = excluded.name,
                   assignment_id = excluded.assignment_id`,
              )
                .bind(rubricId, rubric.title, assignmentId, now)
                .run();

              // Sync rubric criteria
              if (rubric.data) {
                for (let i = 0; i < rubric.data.length; i++) {
                  const criterion = rubric.data[i];
                  await c.env.DB.prepare(
                    `INSERT INTO rubric_criterion (id, rubric_id, title, description, points_possible, sort_order)
                     VALUES (?, ?, ?, ?, ?, ?)
                     ON CONFLICT(id) DO UPDATE SET
                       title = excluded.title,
                       description = excluded.description,
                       points_possible = excluded.points_possible,
                       sort_order = excluded.sort_order`,
                  )
                    .bind(
                      criterion.id,
                      rubricId,
                      criterion.description,
                      criterion.long_description || null,
                      criterion.points,
                      i,
                    )
                    .run();
                }
              }
              summary.rubrics++;
            } catch (e: any) {
              summary.errors.push(`Rubric for ${assignment.name}: ${e.message}`);
            }
          }

          // If assignment has inline rubric (no separate rubric object)
          if (!rubricId && assignment.rubric) {
            rubricId = `inline-${assignmentId}`;
            await c.env.DB.prepare(
              `INSERT INTO rubric (id, name, assignment_id, created_at)
               VALUES (?, ?, ?, ?)
               ON CONFLICT(id) DO UPDATE SET
                 name = excluded.name,
                 assignment_id = excluded.assignment_id`,
            )
              .bind(rubricId, `Rubric for ${assignment.name}`, assignmentId, now)
              .run();

            for (let i = 0; i < assignment.rubric.length; i++) {
              const criterion = assignment.rubric[i];
              await c.env.DB.prepare(
                `INSERT INTO rubric_criterion (id, rubric_id, title, description, points_possible, sort_order)
                 VALUES (?, ?, ?, ?, ?, ?)
                 ON CONFLICT(id) DO UPDATE SET
                   title = excluded.title,
                   description = excluded.description,
                   points_possible = excluded.points_possible,
                   sort_order = excluded.sort_order`,
              )
                .bind(
                  criterion.id,
                  rubricId,
                  criterion.description,
                  criterion.long_description || null,
                  criterion.points,
                  i,
                )
                .run();
            }
            summary.rubrics++;
          }

          await c.env.DB.prepare(
            `INSERT INTO assignment (id, course_id, name, canvas_assignment_id, points_possible, rubric_id, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?)
             ON CONFLICT(id) DO UPDATE SET
               name = excluded.name,
               points_possible = excluded.points_possible,
               rubric_id = excluded.rubric_id`,
          )
            .bind(
              assignmentId,
              courseId,
              assignment.name,
              assignmentId,
              assignment.points_possible,
              rubricId,
              now,
            )
            .run();

          summary.assignments++;
        }
      } catch (e: any) {
        summary.errors.push(`Assignments for ${course.name}: ${e.message}`);
      }
    }

    // Audit log
    await c.env.DB.prepare(
      `INSERT INTO audit_log (id, action, entity_type, detail, created_at)
       VALUES (?, 'canvas_sync', 'system', ?, ?)`,
    )
      .bind(
        crypto.randomUUID(),
        JSON.stringify(summary),
        now,
      )
      .run();

    return c.json({ ok: true, summary });
  } catch (e: any) {
    return c.json({ error: `Canvas sync failed: ${e.message}`, summary }, 500);
  }
});

/**
 * GET /api/canvas/courses — list synced courses from D1
 */
canvas.get('/courses', async (c) => {
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM course ORDER BY synced_at DESC',
  ).all();
  return c.json(results || []);
});

/**
 * GET /api/canvas/courses/:id/students — list students for a course
 */
canvas.get('/courses/:id/students', async (c) => {
  const courseId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM student WHERE course_id = ? ORDER BY name',
  )
    .bind(courseId)
    .all();
  return c.json(results || []);
});

/**
 * GET /api/canvas/courses/:id/assignments — list assignments for a course
 */
canvas.get('/courses/:id/assignments', async (c) => {
  const courseId = c.req.param('id');
  const { results } = await c.env.DB.prepare(
    'SELECT * FROM assignment WHERE course_id = ? ORDER BY created_at DESC',
  )
    .bind(courseId)
    .all();
  return c.json(results || []);
});

/**
 * GET /api/canvas/status — check last sync time and staleness
 */
canvas.get('/status', async (c) => {
  const course = await c.env.DB.prepare(
    'SELECT synced_at FROM course ORDER BY synced_at DESC LIMIT 1',
  ).first();

  if (!course) {
    return c.json({ synced: false, last_sync: null, stale: true });
  }

  const lastSync = course.synced_at as number;
  const hoursSince = (Date.now() - lastSync) / (1000 * 60 * 60);

  return c.json({
    synced: true,
    last_sync: lastSync,
    last_sync_ago: `${Math.round(hoursSince)} hours ago`,
    stale: hoursSince > 24,
  });
});

export default canvas;
