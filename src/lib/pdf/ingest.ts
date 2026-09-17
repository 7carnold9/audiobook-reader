import { cleanPages } from './clean'
import { chunkParagraphs } from './chunk'
import { buildChapters } from './chapters'
import { extractPdf } from './extract'
import type { BookRecord } from '../storage/db'

export interface IngestProgress {
  stage: 'reading' | 'extracting' | 'cleaning' | 'done'
  fraction: number
  page?: number
  pageCount?: number
}

export class EmptyPdfError extends Error {
  constructor() {
    super(
      'No text could be extracted from this PDF. It is most likely a scan of ' +
        'a printed page, which needs OCR before it can be read aloud.',
    )
    this.name = 'EmptyPdfError'
  }
}

/** Runs the full ingest pipeline: extract, clean, chunk, detect chapters. */
export async function ingestPdf(
  file: File,
  onProgress?: (progress: IngestProgress) => void,
): Promise<BookRecord> {
  onProgress?.({ stage: 'reading', fraction: 0 })
  const data = await file.arrayBuffer()

  const document = await extractPdf(data, {
    onProgress: (fraction, page, pageCount) =>
      // Extraction is the slow part, so it owns most of the progress bar.
      onProgress?.({ stage: 'extracting', fraction: fraction * 0.9, page, pageCount }),
  })

  onProgress?.({ stage: 'cleaning', fraction: 0.92 })
  const { paragraphs, stats } = cleanPages(document.pages)
  const chunks = chunkParagraphs(paragraphs)
  if (!chunks.length) throw new EmptyPdfError()

  const chapters = buildChapters(chunks, document.outline)
  const wordCount = chunks.reduce((total, chunk) => total + countWords(chunk.text), 0)

  onProgress?.({ stage: 'done', fraction: 1 })

  return {
    id: crypto.randomUUID(),
    title: usableTitle(document.title) ?? file.name.replace(/\.pdf$/i, ''),
    author: usableAuthor(document.author),
    pageCount: document.pageCount,
    wordCount,
    addedAt: Date.now(),
    chunks,
    chapters,
    stats,
  }
}

/**
 * PDF metadata titles are unreliable — exporters leave behind placeholders and
 * source filenames — so obvious junk falls back to the file name.
 */
export function usableTitle(title: string): string | null {
  const trimmed = title.trim()
  if (trimmed.length < 2) return null
  if (/^(untitled|unknown|document\d*|microsoft word|pdf document)$/i.test(trimmed)) return null
  if (/^microsoft word\s*-/i.test(trimmed)) return null
  if (/\.(docx?|pdf|indd|tex|pages|odt)$/i.test(trimmed)) return null
  return trimmed
}

export function usableAuthor(author: string | null): string | null {
  const trimmed = author?.trim() ?? ''
  if (!trimmed) return null
  if (/^(anonymous|unknown|user|administrator|owner)$/i.test(trimmed)) return null
  return trimmed
}

export function countWords(text: string): number {
  return text.split(/\s+/).filter(Boolean).length
}
