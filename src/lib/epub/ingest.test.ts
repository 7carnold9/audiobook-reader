import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { ingestEpub } from './ingest'
import { ZipArchive } from './zip'

/** The fixtures are real archives, built by scripts/make-epub-fixtures.py. */
function fixture(name: string): File {
  return new File([bytes(name)], name, { type: 'application/epub+zip' })
}

function bytes(name: string): Uint8Array<ArrayBuffer> {
  const file = readFileSync(new URL(`./testdata/${name}`, import.meta.url))
  // Node's Buffer is a view on a shared pool; copy so the archive owns its bytes.
  return new Uint8Array(file.buffer.slice(file.byteOffset, file.byteOffset + file.byteLength))
}

function archiveOf(name: string): ZipArchive {
  return ZipArchive.open(bytes(name).buffer)
}

describe('ZipArchive', () => {
  it('lists entries and reads both stored and deflated ones', async () => {
    const archive = archiveOf('sample.epub')
    expect(archive.names()).toContain('META-INF/container.xml')
    // mimetype is stored uncompressed, per the EPUB spec.
    expect(await archive.text('mimetype')).toBe('application/epub+zip')
    expect(await archive.text('META-INF/container.xml')).toContain('OEBPS/content.opf')
  })

  it('refuses something that is not a zip', () => {
    expect(() => ZipArchive.open(new TextEncoder().encode('not a zip at all').buffer as ArrayBuffer)).toThrow(
      /not a zip archive/i,
    )
  })

  it('names the entry it cannot find', async () => {
    const archive = archiveOf('sample.epub')
    await expect(archive.bytes('OEBPS/missing.xhtml')).rejects.toThrow(/missing/)
  })
})

describe('ingestEpub', () => {
  it('reads an EPUB 3 into the same shape a PDF produces', async () => {
    const book = await ingestEpub(fixture('sample.epub'))

    expect(book.title).toBe('The Time Machine')
    expect(book.author).toBe('H. G. Wells')
    // The cover is marked linear="no" and the nav document is not prose.
    expect(book.pageCount).toBe(2)
    expect(book.chunks.length).toBeGreaterThan(3)
  })

  it('keeps the prose and leaves out the scripts', async () => {
    const book = await ingestEpub(fixture('sample.epub'))
    const text = book.chunks.map((chunk) => chunk.text).join(' ')

    expect(text).toContain('The Time Traveller')
    expect(text).toContain('The fire burned brightly.')
    expect(text).not.toContain('console.log')
    expect(text).not.toContain('Cover')
  })

  it('decodes entities and keeps a line break inside its paragraph', async () => {
    const book = await ingestEpub(fixture('sample.epub'))
    const text = book.chunks.map((chunk) => chunk.text).join(' ')

    expect(text).toContain('— for so it will be convenient')
    expect(text).toContain('twinkled, and his usually pale face was flushed & animated')
    expect(text).toContain('“Follow me carefully,”')
  })

  it('takes chapters from the navigation document', async () => {
    const book = await ingestEpub(fixture('sample.epub'))
    expect(book.chapters.map((chapter) => chapter.title)).toEqual(['I. The Inventor', 'II. The Machine'])
    expect(book.chapters[0].chunkIndex).toBe(0)
    expect(book.chapters[1].page).toBe(2)
  })

  it('marks headings so they are narrated as headings', async () => {
    const book = await ingestEpub(fixture('sample.epub'))
    expect(book.chunks[0]).toMatchObject({ text: 'I. The Inventor', heading: true })
  })

  it('falls back to the NCX in an EPUB 2', async () => {
    const book = await ingestEpub(fixture('sample-epub2.epub'))
    expect(book.chapters.map((chapter) => chapter.title)).toEqual(['I. The Inventor', 'II. The Machine'])
  })

  it('reports progress as it works through the spine', async () => {
    const stages: string[] = []
    await ingestEpub(fixture('sample.epub'), (progress) => stages.push(progress.stage))
    expect(stages[0]).toBe('reading')
    expect(stages).toContain('extracting')
    expect(stages[stages.length - 1]).toBe('done')
  })
})
