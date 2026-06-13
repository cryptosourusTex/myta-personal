import { test } from 'node:test';
import assert from 'node:assert/strict';
import './helpers.js'; // sets DB_PATH
import { packVector, unpackVector, cosineSimilarity } from '../lib/embeddings.js';
import { chunkText, extractText, UnsupportedFileError, EmptyDocumentError } from '../lib/extract.js';

test('packVector/unpackVector round-trips a Float32 vector', () => {
  const original = Float32Array.from([0.1, -0.5, 3.14, 0, 100.25]);
  const restored = unpackVector(packVector(original), original.length);
  assert.equal(restored.length, original.length);
  for (let i = 0; i < original.length; i++) {
    assert.ok(Math.abs(restored[i] - original[i]) < 1e-6, `index ${i}`);
  }
});

test('cosineSimilarity: identical=1, opposite=-1, orthogonal=0', () => {
  const a = Float32Array.from([1, 2, 3]);
  assert.ok(Math.abs(cosineSimilarity(a, a) - 1) < 1e-6);
  assert.ok(Math.abs(cosineSimilarity(a, Float32Array.from([-1, -2, -3])) + 1) < 1e-6);
  assert.ok(Math.abs(cosineSimilarity(Float32Array.from([1, 0]), Float32Array.from([0, 1]))) < 1e-6);
  // zero vector is defined as 0 similarity, not NaN
  assert.equal(cosineSimilarity(a, Float32Array.from([0, 0, 0])), 0);
});

test('chunkText keeps short text whole and splits long text with overlap', () => {
  assert.deepEqual(chunkText('One short paragraph.'), ['One short paragraph.']);

  const para = (n: number) => `Paragraph ${n}. ` + 'word '.repeat(60);
  const long = [para(1), para(2), para(3), para(4), para(5)].join('\n\n');
  const chunks = chunkText(long, 600, 100);
  assert.ok(chunks.length > 1, 'should split into multiple chunks');
  assert.ok(chunks.every((ch) => ch.length <= 900), 'no chunk wildly over target');
  assert.ok(chunks.join(' ').includes('Paragraph 5'), 'last paragraph retained');
});

test('extractText reads plain text and rejects unsupported/empty', async () => {
  const text = await extractText('notes.txt', Buffer.from('Hello\r\n\r\n\r\nworld'), 'text/plain');
  assert.equal(text, 'Hello\n\nworld');

  await assert.rejects(() => extractText('legacy.doc', Buffer.from('x'), 'application/msword'), UnsupportedFileError);
  await assert.rejects(() => extractText('image.png', Buffer.from('x'), 'image/png'), UnsupportedFileError);
  await assert.rejects(() => extractText('blank.txt', Buffer.from('   \n  '), 'text/plain'), EmptyDocumentError);
});
