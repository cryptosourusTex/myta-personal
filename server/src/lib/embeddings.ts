import OpenAI from 'openai';
import { getDb } from '../db/index.js';
import { getConfig } from '../config.js';

// Resolve the embedding model and endpoint from stored config, falling back to
// the default LLM endpoint. A dedicated embedding model (nomic-embed-text) is
// recommended; embed_model is set in Settings.
export function getEmbeddingConfig(): { endpoint: string; model: string; apiKey: string } {
  const db = getDb();
  const getVal = (key: string) => {
    const row = db.prepare('SELECT value FROM config WHERE key = ?').get(key) as { value: string } | undefined;
    return row?.value;
  };
  return {
    endpoint: getVal('llm_endpoint') || getConfig().llm.endpoint,
    model: getVal('embed_model') || 'nomic-embed-text',
    apiKey: getVal('llm_api_key') || getConfig().llm.api_key || 'none',
  };
}

// Embed an array of strings via the OpenAI-compatible /embeddings endpoint
// (Ollama, LM Studio, etc. all support this). Returns one Float32Array per input.
export async function embed(texts: string[]): Promise<Float32Array[]> {
  if (texts.length === 0) return [];
  const { endpoint, model, apiKey } = getEmbeddingConfig();
  const client = new OpenAI({ baseURL: endpoint, apiKey });
  const response = await client.embeddings.create({ model, input: texts });
  // Preserve input order (the API returns an index per item).
  const sorted = [...response.data].sort((a, b) => a.index - b.index);
  return sorted.map((d) => Float32Array.from(d.embedding as number[]));
}

export function packVector(vec: Float32Array): Buffer {
  return Buffer.from(vec.buffer, vec.byteOffset, vec.byteLength);
}

export function unpackVector(buf: Buffer, dim: number): Float32Array {
  // Copy into an aligned buffer — SQLite BLOBs are not guaranteed Float32-aligned.
  const copy = Buffer.from(buf);
  return new Float32Array(copy.buffer, copy.byteOffset, dim);
}

export function cosineSimilarity(a: Float32Array, b: Float32Array): number {
  let dot = 0, normA = 0, normB = 0;
  for (let i = 0; i < a.length; i++) {
    dot += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }
  if (normA === 0 || normB === 0) return 0;
  return dot / (Math.sqrt(normA) * Math.sqrt(normB));
}
