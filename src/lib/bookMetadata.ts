/**
 * Bits every format's ingest needs, kept out of the PDF module so that reading
 * an EPUB does not drag pdf.js into the bundle with it.
 */
export interface IngestProgress {
  stage: 'reading' | 'extracting' | 'cleaning' | 'done'
  fraction: number
  page?: number
  pageCount?: number
}

/**
 * Embedded titles are unreliable — exporters leave behind placeholders and
 * source filenames — so obvious junk falls back to the file name.
 */
export function usableTitle(title: string): string | null {
  const trimmed = title.trim()
  if (trimmed.length < 2) return null
  if (/^(untitled|unknown|document\d*|microsoft word|pdf document)$/i.test(trimmed)) return null
  if (/^microsoft word\s*-/i.test(trimmed)) return null
  if (/\.(docx?|pdf|epub|indd|tex|pages|odt)$/i.test(trimmed)) return null
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
