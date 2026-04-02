import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import { Hono } from 'hono';
import { cors } from 'hono/cors';
import { getConfig } from './config.js';
import { getDb } from './db/index.js';
import { existsSync, mkdirSync } from 'fs';
import { resolve } from 'path';
import configRoutes from './routes/config.js';
import vaultRoutes from './routes/vault.js';
import canvasRoutes from './routes/canvas.js';
import attendanceRoutes from './routes/attendance.js';
import gradingRoutes from './routes/grading.js';
import assistantRoutes from './routes/assistant.js';

const config = getConfig();
const app = new Hono();

// Initialize database
getDb();

// Ensure vault directory exists
const vaultPath = resolve(config.storage.path);
if (!existsSync(vaultPath)) {
  mkdirSync(vaultPath, { recursive: true });
}

// CORS for dev
app.use('/api/*', cors());

// Health endpoint
app.get('/api/health', (c) => {
  return c.json({ status: 'ok', version: '1.0.0' });
});

// API routes
app.route('/api/config', configRoutes);
app.route('/api/vault', vaultRoutes);
app.route('/api/canvas', canvasRoutes);
app.route('/api', canvasRoutes);  // /api/courses/* routes
app.route('/api/attendance', attendanceRoutes);
app.route('/api', gradingRoutes);  // /api/rubrics/*, /api/assignments/*, /api/grading/*
app.route('/api/assistant', assistantRoutes);

// Serve static web client
const webRoot = process.env.WEB_DIST || './web/dist';
app.use('/*', serveStatic({ root: webRoot }));
app.get('*', serveStatic({ root: webRoot, path: '/index.html' }));

const port = config.server.port;
console.log(`MyTA Personal starting on port ${port}`);

serve({ fetch: app.fetch, port, hostname: config.server.host }, (info) => {
  console.log(`MyTA Personal running at http://${config.server.host}:${info.port}`);
});

export { app };
