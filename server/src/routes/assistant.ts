import { Hono } from 'hono';
import { getDb } from '../db/index.js';
import { getConfig } from '../config.js';
import { studentDataGuard } from '../ferpa.js';
import { embed, unpackVector, cosineSimilarity } from '../lib/embeddings.js';
import { nanoid } from 'nanoid';
import OpenAI from 'openai';

interface ChunkRow {
  id: string;
  asset_id: string;
  text: string;
  embedding: Buffer;
  dim: number;
  asset_name: string;
}

const assistantRoutes = new Hono();

// Semantic search over indexed vault documents, then draft an answer from the
// top matching chunks. Unlike /answer, the client sends only the question —
// retrieval happens server-side against the embedded index.
assistantRoutes.post('/search', async (c) => {
  const { question, course_id, top_k } = await c.req.json();
  if (!question) return c.json({ error: 'Question is required' }, 400);

  const guard = studentDataGuard();
  if (!guard.allowed) return c.json({ error: guard.reason }, 403);

  const db = getDb();
  const rows = (course_id
    ? db.prepare('SELECT dc.*, va.name as asset_name FROM doc_chunk dc JOIN vault_asset va ON va.id = dc.asset_id WHERE dc.course_id = ?').all(course_id)
    : db.prepare('SELECT dc.*, va.name as asset_name FROM doc_chunk dc JOIN vault_asset va ON va.id = dc.asset_id').all()
  ) as ChunkRow[];

  if (rows.length === 0) {
    return c.json({ error: 'No indexed documents found. Index documents in the Vault first.' }, 400);
  }

  let queryVec: Float32Array;
  try {
    [queryVec] = await embed([question]);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: `Embedding failed: ${message}` }, 502);
  }

  const k = Math.min(Math.max(parseInt(top_k) || 5, 1), 12);
  const ranked = rows
    .map((r) => ({ row: r, score: cosineSimilarity(queryVec, unpackVector(r.embedding, r.dim)) }))
    .sort((a, b) => b.score - a.score)
    .slice(0, k);

  const docsText = ranked.map((r, i) => `--- Excerpt ${i + 1} from ${r.row.asset_name} ---\n${r.row.text}`).join('\n\n');

  const prompt = `You are a course assistant helping a professor with lecture preparation and answering questions, using only the provided course-document excerpts.
Answer ONLY from the excerpts below. If they do not contain the answer, say so explicitly — do not guess.

Course document excerpts:
${docsText}

Question: ${question}

Provide your response in this exact format:
Draft response: [a clear, useful answer drawn from the excerpts]
Source: [which document(s) and excerpt number(s)]
Confidence: [clearly_answered | partially_answered | not_in_documents]`;

  const getVal = (key: string) => {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  };
  const endpoint = getVal('llm_endpoint') || getConfig().llm.endpoint;
  const model = getVal('qa_model') || getVal('llm_model') || getConfig().llm.model;
  const apiKey = getVal('llm_api_key') || getConfig().llm.api_key || 'none';

  try {
    const client = new OpenAI({ baseURL: endpoint, apiKey });
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 600,
    });
    const text = response.choices[0]?.message?.content || '';

    const draftMatch = text.match(/Draft response:\s*(.+?)(?=Source:|$)/is);
    const sourceMatch = text.match(/Source:\s*(.+?)(?=Confidence:|$)/is);
    const confMatch = text.match(/Confidence:\s*(clearly_answered|partially_answered|not_in_documents)/i);

    db.prepare('INSERT INTO audit_log (id, action, entity_type, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nanoid(), 'qa_rag_generated', 'assistant', null, question, Date.now());

    return c.json({
      draft: draftMatch ? draftMatch[1].trim() : text,
      source: sourceMatch ? sourceMatch[1].trim() : 'Unknown',
      confidence: confMatch ? confMatch[1].toLowerCase() : 'partially_answered',
      model,
      excerpts: ranked.map((r) => ({ asset_name: r.row.asset_name, score: Math.round(r.score * 1000) / 1000, preview: r.row.text.slice(0, 160) })),
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

assistantRoutes.post('/answer', async (c) => {
  const { question, course_id, document_contents } = await c.req.json();
  const db = getDb();

  if (!question) return c.json({ error: 'Question is required' }, 400);
  if (!document_contents || document_contents.length === 0) {
    return c.json({ error: 'At least one document is required' }, 400);
  }

  const getVal = (key: string) => {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  };
  const endpoint = getVal('llm_endpoint') || getConfig().llm.endpoint;
  const model = getVal('qa_model') || getVal('llm_model') || getConfig().llm.model;
  const apiKey = getVal('llm_api_key') || getConfig().llm.api_key || 'none';

  const docsText = document_contents.map((d: { name?: string; text: string }) => `--- ${d.name || 'Document'} ---\n${d.text}`).join('\n\n');

  const prompt = `You are a course assistant helping a professor draft a response to a student question.
Answer ONLY from the provided course documents.
If the answer is not in the documents, say so explicitly — do not guess.

Course documents:
${docsText}

Student question: ${question}

Provide your response in this exact format:
Draft response: [2-4 sentences, suitable for sending to a student]
Source: [which document and which section]
Confidence: [clearly_answered | partially_answered | not_in_documents]`;

  try {
    const client = new OpenAI({ baseURL: endpoint, apiKey });
    const response = await client.chat.completions.create({
      model,
      messages: [{ role: 'user', content: prompt }],
      max_tokens: 500,
    });

    const text = response.choices[0]?.message?.content || '';

    const draftMatch = text.match(/Draft response:\s*(.+?)(?=Source:|$)/is);
    const sourceMatch = text.match(/Source:\s*(.+?)(?=Confidence:|$)/is);
    const confMatch = text.match(/Confidence:\s*(clearly_answered|partially_answered|not_in_documents)/i);

    const draft = draftMatch ? draftMatch[1].trim() : text;
    const source = sourceMatch ? sourceMatch[1].trim() : 'Unknown';
    const confidence = confMatch ? confMatch[1].toLowerCase() : 'partially_answered';

    // Audit log
    const auditResult = db.prepare('INSERT INTO audit_log (id, action, entity_type, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nanoid(), 'qa_draft_generated', 'assistant', null, question, Date.now());
    if (auditResult.changes !== 1) {
      process.stderr.write('Warning: audit log insert did not record expected row\n');
    }

    return c.json({ draft, source, confidence, model });
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return c.json({ error: message }, 500);
  }
});

export default assistantRoutes;
