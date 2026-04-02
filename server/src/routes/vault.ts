import { Hono } from 'hono';
import { getDb } from '../db/index.js';
import { getConfig } from '../config.js';
import { nanoid } from 'nanoid';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, rmSync } from 'fs';
import { join, resolve } from 'path';

const vaultRoutes = new Hono();

function getVaultPath(): string {
  return resolve(getConfig().storage.path);
}

// List vault assets
vaultRoutes.get('/assets', (c) => {
  const courseId = c.req.query('course_id');
  const db = getDb();
  let rows;
  if (courseId) {
    rows = db.prepare('SELECT * FROM vault_asset WHERE course_id = ? ORDER BY created_at DESC').all(courseId);
  } else {
    rows = db.prepare('SELECT * FROM vault_asset ORDER BY created_at DESC').all();
  }
  return c.json(rows);
});

// Upload file
vaultRoutes.post('/upload', async (c) => {
  const formData = await c.req.formData();
  const file = formData.get('file') as File | null;
  const courseId = formData.get('course_id') as string | null;

  if (!file) {
    return c.json({ error: 'No file provided' }, 400);
  }

  const db = getDb();
  const id = nanoid();
  const assetDir = join(getVaultPath(), id);
  mkdirSync(assetDir, { recursive: true });

  const buffer = Buffer.from(await file.arrayBuffer());
  const filePath = join(assetDir, file.name);
  writeFileSync(filePath, buffer);

  const encrypted = getConfig().storage.encryption ? 1 : 0;
  const row = db.prepare('SELECT value FROM config WHERE key = ?').get('storage_encryption') as { value: string } | undefined;
  const encryptionEnabled = row?.value === 'true' || encrypted;

  const insertResult = db.prepare(
    'INSERT INTO vault_asset (id, name, type, course_id, file_path, size_bytes, encrypted, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)'
  ).run(id, file.name, file.type || 'application/octet-stream', courseId || null, filePath, buffer.length, encryptionEnabled ? 1 : 0, Date.now());
  if (!insertResult.changes) {
    return c.json({ error: 'Failed to create asset record' }, 500);
  }

  return c.json({
    id,
    name: file.name,
    type: file.type,
    size_bytes: buffer.length,
    encrypted: !!encryptionEnabled,
  });
});

// Download file
vaultRoutes.get('/assets/:id/download', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const asset = db.prepare('SELECT * FROM vault_asset WHERE id = ?').get(id) as any;

  if (!asset || !existsSync(asset.file_path)) {
    return c.json({ error: 'Asset not found' }, 404);
  }

  const data = readFileSync(asset.file_path);
  return new Response(data, {
    headers: {
      'Content-Type': asset.type || 'application/octet-stream',
      'Content-Disposition': `attachment; filename="${asset.name}"`,
      'Content-Length': String(data.length),
    },
  });
});

// Delete file
vaultRoutes.delete('/assets/:id', (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const asset = db.prepare('SELECT * FROM vault_asset WHERE id = ?').get(id) as any;

  if (!asset) {
    return c.json({ error: 'Asset not found' }, 404);
  }

  // Delete file from disk
  try {
    if (existsSync(asset.file_path)) unlinkSync(asset.file_path);
    const assetDir = join(getVaultPath(), id);
    if (existsSync(assetDir)) {
      rmSync(assetDir, { recursive: true });
    }
  } catch (err) {
    // Log but continue — DB record cleanup below is more important than leftover files
    process.stderr.write(`Warning: failed to remove vault file/dir for asset ${id}: ${err instanceof Error ? err.message : String(err)}\n`);
  }

  const result = db.prepare('DELETE FROM vault_asset WHERE id = ?').run(id);
  if (!result.changes) {
    return c.json({ error: 'Delete failed — asset row not removed' }, 500);
  }
  return c.json({ deleted: id });
});

export default vaultRoutes;
