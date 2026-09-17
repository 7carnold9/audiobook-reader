import type { Chapter, Chunk, OutlineEntry } from './types'

const CHAPTERISH = /^(chapter|part|section|book|appendix|prologue|epilogue|introduction|conclusion|preface|foreword)\b/i

/**
 * Builds the chapter list, preferring the PDF's own outline (bookmarks) and
 * falling back to detected headings.
 */
export function buildChapters(chunks: Chunk[], outline: OutlineEntry[]): Chapter[] {
  if (!chunks.length) return []
  const fromOutline = chaptersFromOutline(chunks, outline)
  const chapters = fromOutline.length >= 2 ? fromOutline : chaptersFromHeadings(chunks)

  if (!chapters.length || chapters[0].chunkIndex > 0) {
    chapters.unshift({ title: 'Beginning', chunkIndex: 0, page: chunks[0].page, level: 0 })
  }
  return dedupe(chapters)
}

function chaptersFromOutline(chunks: Chunk[], outline: OutlineEntry[]): Chapter[] {
  const chapters: Chapter[] = []
  for (const entry of outline) {
    if (entry.page === null) continue
    const chunkIndex = firstChunkOnPage(chunks, entry.page, entry.title)
    if (chunkIndex === -1) continue
    chapters.push({
      title: entry.title,
      chunkIndex,
      page: entry.page,
      level: entry.level,
    })
  }
  return chapters.sort((a, b) => a.chunkIndex - b.chunkIndex)
}

function chaptersFromHeadings(chunks: Chunk[]): Chapter[] {
  const headings = chunks.filter((chunk) => chunk.heading)
  // Some documents mark every bold run as a heading; when that happens keep
  // only the ones that actually name a chapter.
  const useful = headings.length > 80 ? headings.filter((chunk) => CHAPTERISH.test(chunk.text)) : headings
  return useful.map((chunk) => ({
    title: chunk.text.slice(0, 120),
    chunkIndex: chunk.index,
    page: chunk.page,
    level: CHAPTERISH.test(chunk.text) ? 0 : 1,
  }))
}

/** Prefers a heading chunk on the page whose text matches the outline title. */
function firstChunkOnPage(chunks: Chunk[], page: number, title: string): number {
  const normalizedTitle = normalize(title)
  let fallback = -1
  for (const chunk of chunks) {
    if (chunk.page < page) continue
    if (chunk.page > page + 1) break
    if (fallback === -1) fallback = chunk.index
    if (chunk.page === page && normalize(chunk.text).startsWith(normalizedTitle.slice(0, 24))) {
      return chunk.index
    }
  }
  return fallback
}

function normalize(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9 ]+/g, ' ').replace(/\s+/g, ' ').trim()
}

function dedupe(chapters: Chapter[]): Chapter[] {
  const out: Chapter[] = []
  for (const chapter of chapters.sort((a, b) => a.chunkIndex - b.chunkIndex)) {
    if (out.length && out[out.length - 1].chunkIndex === chapter.chunkIndex) continue
    out.push(chapter)
  }
  return out
}
