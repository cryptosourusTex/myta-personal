import { Hono } from 'hono';
import { getDb } from '../db/index.js';
import { getConfig } from '../config.js';
import { nanoid } from 'nanoid';
import OpenAI from 'openai';

const assistantRoutes = new Hono();

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

  const docsText = document_contents.map((d: any) => `--- ${d.name || 'Document'} ---\n${d.text}`).join('\n\n');

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
    db.prepare('INSERT INTO audit_log (id, action, entity_type, entity_id, detail, created_at) VALUES (?, ?, ?, ?, ?, ?)')
      .run(nanoid(), 'qa_draft_generated', 'assistant', null, question, Date.now());

    return c.json({ draft, source, confidence, model });
  } catch (err: any) {
    return c.json({ error: err.message }, 500);
  }
});

export default assistantRoutes;
