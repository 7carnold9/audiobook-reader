import { ingestEpub } from './epub/ingest'
import { ingestPdf } from './pdf/ingest'
import type { IngestProgress } from './bookMetadata'
import type { BookRecord } from './storage/db'

export type { IngestProgress } from './bookMetadata'
export { EmptyPdfError } from './pdf/ingest'
export { EmptyEpubError } from './epub/ingest'

/** File types the library accepts, for the file picker and drag and drop. */
export const ACCEPTED_TYPES = 'application/pdf,.pdf,application/epub+zip,.epub'

export function isSupportedBook(file: File): boolean {
  return /\.(pdf|epub)$/i.test(file.name) || /^application\/(pdf|epub\+zip)$/.test(file.type)
}

/** Routes a dropped file to the pipeline for its format. */
export function ingestFile(
  file: File,
  onProgress?: (progress: IngestProgress) => void,
): Promise<BookRecord> {
  const epub = /\.epub$/i.test(file.name) || file.type === 'application/epub+zip'
  return epub ? ingestEpub(file, onProgress) : ingestPdf(file, onProgress)
}
