import { Hono } from 'hono';
import { cors } from 'hono/cors';
import userRoutes from './routes/user';
import canvasRoutes from './routes/canvas';

export type Env = {
  DB: D1Database;
  VAULT: R2Bucket;
  ANTHROPIC_API_KEY: string;
};

const app = new Hono<{ Bindings: Env }>();

app.use('/*', cors());

// Health check
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', timestamp: Date.now() });
});

// User / auth routes
app.route('/api/user', userRoutes);

// Canvas sync routes
app.route('/api/canvas', canvasRoutes);

// Placeholder routes — each module will add its own
app.all('/api/attendance/*', (c) => c.json({ error: 'Attendance module not yet built' }, 501));
app.all('/api/grading/*', (c) => c.json({ error: 'Grading module not yet built' }, 501));
app.all('/api/assistant/*', (c) => c.json({ error: 'Assistant module not yet built' }, 501));

export default app;
