import * as pdfjs from 'pdfjs-dist'
import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import workerUrl from 'pdfjs-dist/build/pdf.worker.min.mjs?url'
import { groupIntoLines } from './lines'
import type { ExtractedDocument, OutlineEntry, RawPage } from './types'

pdfjs.GlobalWorkerOptions.workerSrc = workerUrl

export interface ExtractOptions {
  /** Called after each page with a 0..1 fraction. */
  onProgress?: (fraction: number, page: number, pageCount: number) => void
  signal?: AbortSignal
}

/**
 * Pulls text out of a PDF page by page, grouping the positioned glyph runs that
 * pdf.js returns back into visual lines. Ordering, header/footer removal and
 * paragraph assembly happen later in `clean.ts` — this stage stays faithful to
 * what is actually on the page.
 */
export async function extractPdf(
  data: ArrayBuffer,
  options: ExtractOptions = {},
): Promise<ExtractedDocument> {
  const doc = await pdfjs.getDocument({
    data,
    isEvalSupported: false,
    // Served by the `pdfjsAssets` plugin in vite.config.ts. Resolved against
    // the page so the app also works when hosted under a subdirectory.
    standardFontDataUrl: assetUrl('standard_fonts/'),
    cMapUrl: assetUrl('cmaps/'),
    cMapPacked: true,
  }).promise
  try {
    const pages: RawPage[] = []
    for (let pageNumber = 1; pageNumber <= doc.numPages; pageNumber++) {
      options.signal?.throwIfAborted()
      const page = await doc.getPage(pageNumber)
      const viewport = page.getViewport({ scale: 1 })
      const content = await page.getTextContent()
      const items = content.items.filter(isTextItem)
      pages.push({
        page: pageNumber,
        width: viewport.width,
        height: viewport.height,
        lines: groupIntoLines(items, pageNumber),
      })
      page.cleanup()
      options.onProgress?.(pageNumber / doc.numPages, pageNumber, doc.numPages)
      // Yield so a long book does not freeze the UI thread between pages.
      await new Promise((resolve) => setTimeout(resolve, 0))
    }

    const metadata = await doc.getMetadata().catch(() => null)
    const info = (metadata?.info ?? {}) as { Title?: string; Author?: string }

    return {
      title: (info.Title ?? '').trim(),
      author: (info.Author ?? '').trim() || null,
      pageCount: doc.numPages,
      pages,
      outline: await readOutline(doc),
    }
  } finally {
    await doc.destroy()
  }
}

function assetUrl(path: string): string {
  return new URL(path, document.baseURI).href
}

function isTextItem(item: unknown): item is TextItem {
  return typeof (item as TextItem)?.str === 'string'
}

async function readOutline(doc: pdfjs.PDFDocumentProxy): Promise<OutlineEntry[]> {
  type RawOutlineItem = {
    title: string
    dest: string | unknown[] | null
    items?: RawOutlineItem[]
  }
  const root = (await doc.getOutline().catch(() => null)) as RawOutlineItem[] | null
  if (!root?.length) return []

  const entries: OutlineEntry[] = []
  const walk = async (items: RawOutlineItem[], level: number): Promise<void> => {
    for (const item of items) {
      entries.push({
        title: (item.title ?? '').replace(/\s+/g, ' ').trim(),
        page: await resolveDestinationPage(doc, item.dest),
        level,
      })
      if (item.items?.length) await walk(item.items, level + 1)
    }
  }
  await walk(root, 0)
  return entries.filter((entry) => entry.title.length > 0)
}

async function resolveDestinationPage(
  doc: pdfjs.PDFDocumentProxy,
  dest: string | unknown[] | null,
): Promise<number | null> {
  try {
    const resolved = typeof dest === 'string' ? await doc.getDestination(dest) : dest
    const ref = Array.isArray(resolved) ? resolved[0] : null
    if (!ref || typeof ref !== 'object') return null
    const index = await doc.getPageIndex(ref as never)
    return index + 1
  } catch {
    return null
  }
}
