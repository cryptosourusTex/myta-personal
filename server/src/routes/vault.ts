import { Hono } from 'hono';
import { getDb } from '../db/index.js';
import { getConfig } from '../config.js';
import { studentDataGuard } from '../ferpa.js';
import { extractText, chunkText, UnsupportedFileError, EmptyDocumentError } from '../lib/extract.js';
import { embed, packVector } from '../lib/embeddings.js';
import { nanoid } from 'nanoid';
import { existsSync, mkdirSync, writeFileSync, readFileSync, unlinkSync, rmSync } from 'fs';
import { join, resolve } from 'path';

interface AssetRow {
  id: string;
  name: string;
  type: string;
  course_id: string | null;
  file_path: string;
  encrypted: number;
}

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

// Index a vault asset for semantic search: extract text, chunk, embed, store.
// Re-indexing replaces any existing chunks for the asset.
vaultRoutes.post('/assets/:id/index', async (c) => {
  const id = c.req.param('id');
  const db = getDb();
  const asset = db.prepare('SELECT * FROM vault_asset WHERE id = ?').get(id) as AssetRow | undefined;
  if (!asset) return c.json({ error: 'Asset not found' }, 404);
  if (!existsSync(asset.file_path)) return c.json({ error: 'Asset file is missing on disk' }, 404);
  if (asset.encrypted) {
    return c.json({ error: 'Encrypted assets cannot be indexed — the server only sees ciphertext. Disable encryption for documents you want searchable.' }, 422);
  }

  // Embedding sends document text to the LLM endpoint — hold to the same
  // local-only guarantee as the rest of the app.
  const guard = studentDataGuard();
  if (!guard.allowed) return c.json({ error: guard.reason }, 403);

  let chunks: string[];
  try {
    const buffer = readFileSync(asset.file_path);
    const text = await extractText(asset.name, buffer, asset.type);
    chunks = chunkText(text);
  } catch (err) {
    if (err instanceof UnsupportedFileError) return c.json({ error: err.message }, 415);
    if (err instanceof EmptyDocumentError) return c.json({ error: err.message }, 422);
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Could not read ${asset.name}: ${message}` }, 422);
  }

  let vectors: Float32Array[];
  try {
    vectors = await embed(chunks);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Embedding failed: ${message}. Is the embedding model pulled (ollama pull nomic-embed-text)?` }, 502);
  }

  const model = (db.prepare('SELECT value FROM config WHERE key = ?').get('embed_model') as { value: string } | undefined)?.value || 'nomic-embed-text';
  const now = Date.now();
  const rebuild = db.transaction(() => {
    db.prepare('DELETE FROM doc_chunk WHERE asset_id = ?').run(id);
    const ins = db.prepare('INSERT INTO doc_chunk (id, asset_id, course_id, chunk_index, text, embedding, dim, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)');
    chunks.forEach((chunk, i) => {
      ins.run(nanoid(), id, asset.course_id, i, chunk, packVector(vectors[i]), vectors[i].length, model, now);
    });
  });
  rebuild();

  db.prepare('INSERT INTO audit_log (id, action, entity_type, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
    .run(nanoid(), 'vault_indexed', 'vault_asset', id, `chunks=${chunks.length} model=${model}`, now);

  return c.json({ id, name: asset.name, chunks: chunks.length, model });
});

// Index status: which assets are indexed and chunk counts
vaultRoutes.get('/index/status', (c) => {
  const db = getDb();
  const rows = db.prepare(`
    SELECT va.id, va.name, va.encrypted,
           COUNT(dc.id) as chunk_count,
           MAX(dc.created_at) as indexed_at
    FROM vault_asset va
    LEFT JOIN doc_chunk dc ON dc.asset_id = va.id
    GROUP BY va.id
    ORDER BY va.created_at DESC
  `).all();
  return c.json(rows);
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

  db.prepare('DELETE FROM doc_chunk WHERE asset_id = ?').run(id);
  const result = db.prepare('DELETE FROM vault_asset WHERE id = ?').run(id);
  if (!result.changes) {
    return c.json({ error: 'Delete failed — asset row not removed' }, 500);
  }
  return c.json({ deleted: id });
});

export default vaultRoutes;
