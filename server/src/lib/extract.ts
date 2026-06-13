import { PDFParse } from 'pdf-parse';
import mammoth from 'mammoth';

export class UnsupportedFileError extends Error {}
export class EmptyDocumentError extends Error {}

// Extract plain text from a document buffer. Shared by grading submission
// upload and vault indexing so both support the same formats identically.
// Throws UnsupportedFileError for types we can't read and EmptyDocumentError
// when extraction yields nothing (e.g. a scanned PDF with no text layer).
export async function extractText(name: string, buffer: Buffer, mimeType = ''): Promise<string> {
  const ext = name.toLowerCase().split('.').pop() || '';

  let text: string;
  if (ext === 'pdf') {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      text = result.text;
    } finally {
      await parser.destroy();
    }
  } else if (ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer });
    text = result.value;
  } else if (ext === 'doc') {
    throw new UnsupportedFileError('Legacy .doc is not supported — save as .docx or PDF and re-upload');
  } else if (['md', 'markdown', 'txt', 'text', 'rtf'].includes(ext) || mimeType.startsWith('text/')) {
    text = buffer.toString('utf-8');
  } else {
    throw new UnsupportedFileError(`Unsupported file type ".${ext}" — upload PDF, .docx, Markdown, or plain text`);
  }

  text = text.replace(/\r\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim();
  if (!text) throw new EmptyDocumentError(`No text found in ${name} — if it is a scan, OCR is not supported here yet`);
  return text;
}

// Split text into overlapping chunks for embedding. Paragraph-aware: packs
// whole paragraphs up to the target size, with a tail overlap so a sentence
// split across a boundary still has its context in one chunk.
export function chunkText(text: string, targetChars = 1200, overlapChars = 200): string[] {
  const paragraphs = text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);
  const chunks: string[] = [];
  let current = '';

  for (const para of paragraphs) {
    if (para.length > targetChars) {
      // A single oversized paragraph: flush, then hard-split it.
      if (current) { chunks.push(current); current = ''; }
      for (let i = 0; i < para.length; i += targetChars - overlapChars) {
        chunks.push(para.slice(i, i + targetChars));
      }
      continue;
    }
    if (current && current.length + para.length + 2 > targetChars) {
      chunks.push(current);
      const tail = current.slice(-overlapChars);
      current = tail + '\n\n' + para;
    } else {
      current = current ? current + '\n\n' + para : para;
    }
  }
  if (current) chunks.push(current);
  return chunks;
}
