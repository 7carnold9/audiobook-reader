import { ZipArchive } from './zip'
import { documentParagraphs, parseContainer, parseNav, parseNcx, parsePackage, resolvePath } from './extract'
import type { TocEntry } from './extract'
import { chunkParagraphs } from '../pdf/chunk'
import { buildChapters } from '../pdf/chapters'
import { countWords, usableAuthor, usableTitle } from '../bookMetadata'
import type { IngestProgress } from '../bookMetadata'
import type { Chapter, Paragraph } from '../pdf/types'
import type { BookRecord } from '../storage/db'

export class EmptyEpubError extends Error {
  constructor() {
    super('No readable text could be found in this EPUB.')
    this.name = 'EmptyEpubError'
  }
}

/**
 * Reads an EPUB into the same shape a PDF produces.
 *
 * EPUB states semantically what the PDF pipeline has to infer from coordinates
 * — paragraphs are `<p>`, headings are `<h1>`, reading order is the spine — so
 * none of the column, header or footnote heuristics apply. Everything after
 * paragraphs (chunking, speech normalization, narration) is shared.
 */
export async function ingestEpub(
  file: File,
  onProgress?: (progress: IngestProgress) => void,
): Promise<BookRecord> {
  onProgress?.({ stage: 'reading', fraction: 0 })
  const archive = ZipArchive.open(await file.arrayBuffer())

  const opfPath = parseContainer(await archive.text('META-INF/container.xml'))
  const pkg = parsePackage(await archive.text(opfPath), opfPath)

  // The navigation document is a table of contents, not part of the prose.
  const documents = pkg.spine.filter((path) => path !== pkg.navPath)
  if (!documents.length) throw new EmptyEpubError()

  const paragraphs: Paragraph[] = []
  /** Archive path -> the section number it was read into. */
  const sections = new Map<string, number>()

  for (const [index, path] of documents.entries()) {
    const section = index + 1
    sections.set(path, section)
    if (archive.has(path)) {
      paragraphs.push(...documentParagraphs(await archive.text(path), section))
    }
    onProgress?.({
      stage: 'extracting',
      fraction: ((index + 1) / documents.length) * 0.9,
      page: section,
      pageCount: documents.length,
    })
    // Yield so a long book does not freeze the UI thread between documents.
    await new Promise((resolve) => setTimeout(resolve, 0))
  }

  onProgress?.({ stage: 'cleaning', fraction: 0.92 })
  const chunks = chunkParagraphs(paragraphs)
  if (!chunks.length) throw new EmptyEpubError()

  const toc = await readToc(archive, pkg.navPath, pkg.ncxPath)
  const chapters = chaptersFromToc(toc, sections, chunks)

  onProgress?.({ stage: 'done', fraction: 1 })

  return {
    id: crypto.randomUUID(),
    format: 'epub',
    title: usableTitle(pkg.title) ?? file.name.replace(/\.epub$/i, ''),
    author: usableAuthor(pkg.author),
    pageCount: documents.length,
    wordCount: chunks.reduce((total, chunk) => total + countWords(chunk.text), 0),
    addedAt: Date.now(),
    chunks,
    chapters,
    stats: {
      // Nothing is guessed at for an EPUB, so the cleaning counters stay at zero.
      bodyFontSize: 0,
      droppedMarginLines: 0,
      droppedFootnoteLines: 0,
      twoColumnPages: 0,
    },
  }
}

async function readToc(
  archive: ZipArchive,
  navPath: string | null,
  ncxPath: string | null,
): Promise<TocEntry[]> {
  if (navPath && archive.has(navPath)) {
    const entries = parseNav(await archive.text(navPath), navPath)
    if (entries.length) return entries
  }
  if (ncxPath && archive.has(ncxPath)) {
    return parseNcx(await archive.text(ncxPath), ncxPath)
  }
  return []
}

/** Anchors each table-of-contents entry to the first chunk of its document. */
export function chaptersFromToc(
  toc: TocEntry[],
  sections: Map<string, number>,
  chunks: { index: number; page: number }[],
): Chapter[] {
  const seen = new Set<number>()
  const chapters: Chapter[] = []

  for (const entry of toc) {
    const section = sections.get(resolvePath(entry.href, ''))
    if (section === undefined) continue
    const first = chunks.find((chunk) => chunk.page === section)
    if (!first || seen.has(first.index)) continue
    seen.add(first.index)
    chapters.push({ title: entry.title, chunkIndex: first.index, page: section, level: entry.level })
  }

  // A book with no usable table of contents still has its headings.
  if (chapters.length < 2) return buildChapters(chunks as Parameters<typeof buildChapters>[0], [])
  if (chapters[0].chunkIndex > 0 && chunks.length) {
    chapters.unshift({ title: 'Beginning', chunkIndex: 0, page: chunks[0].page, level: 0 })
  }
  return chapters
}
