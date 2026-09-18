import { tokenize } from './markup'
import type { Token } from './markup'
import type { Paragraph } from '../pdf/types'

export interface TocEntry {
  title: string
  /** Path inside the archive, with any fragment kept. */
  href: string
  level: number
}

export interface EpubPackage {
  title: string
  author: string | null
  /** Archive paths of the content documents, in reading order. */
  spine: string[]
  /** The navigation document, which is read for chapters and never narrated. */
  navPath: string | null
  ncxPath: string | null
}

/** Resolves an href against the directory of the file that referenced it. */
export function resolvePath(base: string, href: string): string {
  const path = href.split('#')[0]
  if (!path) return base
  if (path.startsWith('/')) return path.slice(1)
  const parts = base.split('/').slice(0, -1).concat(path.split('/'))
  const out: string[] = []
  for (const part of parts) {
    if (!part || part === '.') continue
    if (part === '..') out.pop()
    else out.push(part)
  }
  return out.join('/')
}

/** META-INF/container.xml points at the package document. */
export function parseContainer(xml: string): string {
  for (const token of tokenize(xml)) {
    if (token.kind === 'open' && token.name === 'rootfile' && token.attrs['full-path']) {
      return token.attrs['full-path']
    }
  }
  throw new Error('This EPUB has no package document, so its contents cannot be found.')
}

/** The package document holds the metadata, the manifest and the reading order. */
export function parsePackage(xml: string, opfPath: string): EpubPackage {
  const tokens = tokenize(xml)
  const manifest = new Map<string, { href: string; properties: string; mediaType: string }>()
  const spineIds: string[] = []
  let title = ''
  let author: string | null = null
  let ncxId: string | null = null
  let reading: 'title' | 'creator' | null = null

  for (let i = 0; i < tokens.length; i++) {
    const token = tokens[i]
    if (token.kind === 'open') {
      if (token.name === 'item' && token.attrs.id && token.attrs.href) {
        manifest.set(token.attrs.id, {
          href: token.attrs.href,
          properties: token.attrs.properties ?? '',
          mediaType: token.attrs['media-type'] ?? '',
        })
      } else if (token.name === 'itemref' && token.attrs.idref) {
        // linear="no" marks front matter the reader is not meant to walk through.
        if (token.attrs.linear !== 'no') spineIds.push(token.attrs.idref)
      } else if (token.name === 'spine') {
        ncxId = token.attrs.toc ?? null
      } else if (token.name === 'title') {
        reading = 'title'
      } else if (token.name === 'creator') {
        reading = 'creator'
      }
    } else if (token.kind === 'text' && reading) {
      const text = token.text.replace(/\s+/g, ' ').trim()
      if (text) {
        if (reading === 'title' && !title) title = text
        if (reading === 'creator' && !author) author = text
      }
    } else if (token.kind === 'close') {
      reading = null
    }
  }

  const navItem = [...manifest.values()].find((item) => item.properties.split(/\s+/).includes('nav'))
  const ncxItem = ncxId ? manifest.get(ncxId) : undefined

  return {
    title,
    author,
    spine: spineIds
      .map((id) => manifest.get(id)?.href)
      .filter((href): href is string => Boolean(href))
      .map((href) => resolvePath(opfPath, href)),
    navPath: navItem ? resolvePath(opfPath, navItem.href) : null,
    ncxPath: ncxItem ? resolvePath(opfPath, ncxItem.href) : null,
  }
}

/** EPUB 3: the table of contents is a nav element of ordered lists. */
export function parseNav(xhtml: string, navPath: string): TocEntry[] {
  const tokens = tokenize(xhtml)
  const entries: TocEntry[] = []
  let insideToc = false
  let depth = 0
  let listDepth = 0
  let current: { href: string; text: string } | null = null

  for (const token of tokens) {
    if (token.kind === 'open') {
      if (token.name === 'nav') {
        // Other navs in the same document hold page lists and landmarks.
        insideToc = (token.attrs.type ?? '').split(/\s+/).includes('toc')
        depth = 0
      } else if (insideToc && (token.name === 'ol' || token.name === 'ul')) {
        listDepth++
      } else if (insideToc && token.name === 'a' && token.attrs.href) {
        current = { href: resolvePath(navPath, token.attrs.href), text: '' }
        depth = listDepth
      }
    } else if (token.kind === 'text' && current) {
      current.text += token.text
    } else if (token.kind === 'close') {
      if (token.name === 'a' && current) {
        const title = current.text.replace(/\s+/g, ' ').trim()
        if (title) entries.push({ title, href: current.href, level: Math.max(0, depth - 1) })
        current = null
      } else if (insideToc && (token.name === 'ol' || token.name === 'ul')) {
        listDepth--
      } else if (token.name === 'nav') {
        insideToc = false
      }
    }
  }

  return entries
}

/** EPUB 2: the same information in an NCX document. */
export function parseNcx(xml: string, ncxPath: string): TocEntry[] {
  const tokens = tokenize(xml)
  const entries: TocEntry[] = []
  let depth = -1
  let label: string | null = null
  let reading = false
  // <text> also appears in docTitle and docAuthor, so only the ones inside a
  // navLabel are chapter titles.
  let insideLabel = false

  for (const token of tokens) {
    if (token.kind === 'open') {
      if (token.name === 'navpoint') depth++
      else if (token.name === 'navlabel') {
        insideLabel = true
        label = null
      } else if (token.name === 'text' && insideLabel) reading = true
      else if (token.name === 'content' && token.attrs.src && label !== null) {
        entries.push({
          title: label.replace(/\s+/g, ' ').trim(),
          href: resolvePath(ncxPath, token.attrs.src),
          level: Math.max(0, depth),
        })
        label = null
      }
    } else if (token.kind === 'text' && reading) {
      label = (label ?? '') + token.text
    } else if (token.kind === 'close') {
      if (token.name === 'text') reading = false
      else if (token.name === 'navlabel') insideLabel = false
      else if (token.name === 'navpoint') depth--
    }
  }

  return entries.filter((entry) => entry.title.length > 0)
}

/** Elements whose text is not part of the book. */
const SKIPPED = new Set(['script', 'style', 'head', 'title', 'nav', 'svg', 'figure', 'table'])
/** Elements that end the paragraph being gathered. */
const BLOCKS = new Set([
  'p', 'div', 'li', 'blockquote', 'section', 'article', 'header', 'footer',
  'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'pre', 'figcaption', 'dd', 'dt', 'tr', 'hr',
])
const HEADINGS = new Set(['h1', 'h2', 'h3', 'h4', 'h5', 'h6'])

/**
 * Turns one content document into paragraphs.
 *
 * EPUB gives semantically what the PDF pipeline has to infer from coordinates:
 * a `<p>` is a paragraph and an `<h2>` is a heading, so none of the column,
 * header or footnote heuristics are needed here.
 */
export function documentParagraphs(xhtml: string, section: number): Paragraph[] {
  const paragraphs: Paragraph[] = []
  let buffer = ''
  let headingDepth = 0
  let skipDepth = 0
  const open: string[] = []

  const flush = () => {
    const text = buffer.replace(/\s+/g, ' ').trim()
    buffer = ''
    if (!text) return
    paragraphs.push({ text, page: section, ...(headingDepth > 0 ? { heading: true } : {}) })
  }

  for (const token of tokenize(xhtml) as Token[]) {
    if (token.kind === 'open') {
      if (SKIPPED.has(token.name)) {
        if (!token.selfClosing) skipDepth++
        continue
      }
      if (skipDepth > 0) continue
      if (token.name === 'br') {
        buffer += ' '
        continue
      }
      if (BLOCKS.has(token.name)) {
        flush()
        if (HEADINGS.has(token.name)) headingDepth++
        if (!token.selfClosing) open.push(token.name)
      }
    } else if (token.kind === 'close') {
      if (SKIPPED.has(token.name)) {
        skipDepth = Math.max(0, skipDepth - 1)
        continue
      }
      if (skipDepth > 0) continue
      if (BLOCKS.has(token.name)) {
        flush()
        if (HEADINGS.has(token.name)) headingDepth = Math.max(0, headingDepth - 1)
        const index = open.lastIndexOf(token.name)
        if (index !== -1) open.splice(index, 1)
      }
    } else if (skipDepth === 0) {
      buffer += token.text
    }
  }
  flush()

  return paragraphs
}
