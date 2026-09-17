/**
 * Runs the extraction pipeline over one or more PDFs from the command line and
 * prints what the narrator would actually say. This is how extraction changes
 * get checked against real documents without clicking through the UI.
 *
 *   npm run probe -- fixtures/paper.pdf
 */
import { readFileSync } from 'node:fs'
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs'
import { buildChapters } from '../src/lib/pdf/chapters'
import { chunkParagraphs } from '../src/lib/pdf/chunk'
import { cleanPages } from '../src/lib/pdf/clean'
import { groupIntoLines } from '../src/lib/pdf/lines'
import { toSpeech } from '../src/lib/text/normalize'
import type { OutlineEntry, RawPage } from '../src/lib/pdf/types'

async function probe(path: string): Promise<void> {
  const doc = await getDocument({
    data: new Uint8Array(readFileSync(path)),
    isEvalSupported: false,
  }).promise

  const pages: RawPage[] = []
  for (let number = 1; number <= doc.numPages; number++) {
    const page = await doc.getPage(number)
    const content = await page.getTextContent()
    pages.push({
      page: number,
      width: page.getViewport({ scale: 1 }).width,
      height: page.getViewport({ scale: 1 }).height,
      lines: groupIntoLines(
        content.items.filter((item: { str?: unknown }) => typeof item.str === 'string'),
        number,
      ),
    })
  }

  const outline: OutlineEntry[] = []
  for (const item of ((await doc.getOutline().catch(() => null)) ?? []) as {
    title: string
    dest: unknown
  }[]) {
    let page: number | null = null
    try {
      const dest = typeof item.dest === 'string' ? await doc.getDestination(item.dest) : item.dest
      page = Array.isArray(dest) ? (await doc.getPageIndex(dest[0])) + 1 : null
    } catch {
      page = null
    }
    outline.push({ title: item.title, page, level: 0 })
  }

  const { paragraphs, stats } = cleanPages(pages)
  const chunks = chunkParagraphs(paragraphs)
  const chapters = buildChapters(chunks, outline)

  console.log(`\n=== ${path} ===`)
  console.log(`${doc.numPages} pages, ${chunks.length} chunks`)
  console.log('cleaning:', stats)
  console.log('chapters:', chapters.map((chapter) => `${chapter.title} @#${chapter.chunkIndex}`).join(' | ') || '(none)')
  for (const chunk of chunks) {
    const marks = `${chunk.heading ? ' HEADING' : ''}${chunk.startsParagraph ? ' ¶' : ''}`
    console.log(`  [${chunk.index}] p${chunk.page}${marks} ${JSON.stringify(chunk.text)}`)
  }
  console.log('spoken:', JSON.stringify(toSpeech(chunks.map((chunk) => chunk.text).join(' ')).text.slice(0, 600)))
}

const files = process.argv.slice(2)
if (!files.length) {
  console.error('usage: npm run probe -- <file.pdf> [more.pdf…]')
  process.exit(1)
}
for (const file of files) await probe(file)
