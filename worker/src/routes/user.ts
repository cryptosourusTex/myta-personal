import { Hono } from 'hono';
import type { Env } from '../index';

const user = new Hono<{ Bindings: Env }>();

// Create or update user record (single user — id is always 'me')
user.post('/setup', async (c) => {
  const { canvas_domain, canvas_token_encrypted } = await c.req.json();

  await c.env.DB.prepare(
    `INSERT INTO user (id, canvas_domain, canvas_token_encrypted, created_at)
     VALUES ('me', ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       canvas_domain = excluded.canvas_domain,
       canvas_token_encrypted = excluded.canvas_token_encrypted`,
  )
    .bind(canvas_domain || null, canvas_token_encrypted || null, Date.now())
    .run();

  await c.env.DB.prepare(
    `INSERT INTO audit_log (id, action, entity_type, entity_id, detail, created_at)
     VALUES (?, 'user_setup', 'user', 'me', ?, ?)`,
  )
    .bind(crypto.randomUUID(), 'User setup completed', Date.now())
    .run();

  return c.json({ ok: true });
});

// Get user record
user.get('/me', async (c) => {
  const row = await c.env.DB.prepare('SELECT * FROM user WHERE id = ?')
    .bind('me')
    .first();

  if (!row) return c.json({ exists: false });
  return c.json({
    exists: true,
    canvas_domain: row.canvas_domain,
    has_token: !!row.canvas_token_encrypted,
  });
});

// Update Canvas credentials
user.put('/canvas', async (c) => {
  const { canvas_domain, canvas_token_encrypted } = await c.req.json();

  await c.env.DB.prepare(
    `UPDATE user SET canvas_domain = ?, canvas_token_encrypted = ? WHERE id = 'me'`,
  )
    .bind(canvas_domain || null, canvas_token_encrypted || null)
    .run();

  return c.json({ ok: true });
});

export default user;
