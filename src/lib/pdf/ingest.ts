import { cleanPages } from './clean'
import { chunkParagraphs } from './chunk'
import { buildChapters } from './chapters'
import { extractPdf } from './extract'
import { countWords, usableAuthor, usableTitle } from '../bookMetadata'
import type { IngestProgress } from '../bookMetadata'
import type { BookRecord } from '../storage/db'

export type { IngestProgress } from '../bookMetadata'
export { countWords, usableAuthor, usableTitle } from '../bookMetadata'

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
    format: 'pdf',
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

