import type { Paragraph, RawLine, RawPage } from './types'

const SENTENCE_END = /[.!?]["')\]]?$/

export interface CleanStats {
  bodyFontSize: number
  droppedMarginLines: number
  droppedFootnoteLines: number
  twoColumnPages: number
}

export interface CleanResult {
  paragraphs: Paragraph[]
  stats: CleanStats
}

/**
 * Turns positioned lines into readable paragraphs:
 * column-aware ordering, repeated header/footer removal, footnote removal,
 * de-hyphenation and paragraph-break detection.
 */
export function cleanPages(pages: RawPage[]): CleanResult {
  const bodyFontSize = medianFontSize(pages.flatMap((page) => page.lines))
  const repeated = findRepeatedMarginLines(pages)
  const stats: CleanStats = {
    bodyFontSize,
    droppedMarginLines: 0,
    droppedFootnoteLines: 0,
    twoColumnPages: 0,
  }

  const paragraphs: Paragraph[] = []
  // `right`/`width` describe the column the paragraph's last line came from, so
  // that a page or column break can ask whether that line ran to the margin.
  let open: { lines: RawLine[]; heading: boolean; right: number; width: number } | null = null

  const flush = () => {
    if (!open) return
    const text = joinLines(open.lines)
    if (text) {
      paragraphs.push({
        text,
        page: open.lines[0].page,
        ...(open.heading ? { heading: true } : {}),
      })
    }
    open = null
  }

  for (const page of pages) {
    const kept: RawLine[] = []
    for (const line of page.lines) {
      if (isMarginNoise(line, page, repeated)) {
        stats.droppedMarginLines++
        continue
      }
      if (isFootnote(line, page, bodyFontSize)) {
        stats.droppedFootnoteLines++
        continue
      }
      kept.push(line)
    }

    const blocks = orderLines({ ...page, lines: kept })
    if (blocks.length > 1 || blocks.some((block) => block.column > 0)) stats.twoColumnPages++

    // Heading detection compares against the full text width of the page: a
    // one-line block is not "short" relative to itself.
    const pageWidth = kept.length
      ? Math.max(...kept.map((line) => line.x1)) - Math.min(...kept.map((line) => line.x0))
      : page.width

    for (const block of blocks) {
      // A full-width element on a multi-column page is not part of the column
      // flow, so it never continues or is continued by the surrounding prose.
      if (block.spanning) flush()
      const gap = medianGap(block.lines)
      const left = Math.min(...block.lines.map((line) => line.x0))
      const right = Math.max(...block.lines.map((line) => line.x1))
      const width = Math.max(right - left, 1)

      block.lines.forEach((line, i) => {
        const heading = isHeading(line, bodyFontSize, pageWidth)
        const indented = line.x0 - left > width * 0.03 && line.x0 - left < width * 0.25
        let broken: boolean

        if (i > 0) {
          broken = startsParagraph(line, block.lines[i - 1], gap, left, right, width)
        } else if (open) {
          // At a block boundary — a new page or the next column — prose only
          // continues when the previous line ran to its own right margin.
          const previous = open.lines[open.lines.length - 1]
          const ranToMargin = previous.x1 >= open.right - open.width * 0.12
          broken = indented || !ranToMargin
        } else {
          broken = true
        }

        if (!open || heading || open.heading || broken) {
          flush()
          open = { lines: [line], heading, right, width }
        } else {
          open.lines.push(line)
          open.right = right
          open.width = width
        }
      })
      if (block.spanning) flush()
    }
    // A paragraph may legitimately run across a page break, so `open` is kept.
  }
  flush()

  return { paragraphs, stats }
}

interface Block {
  column: number
  lines: RawLine[]
  /** True for full-width elements on a multi-column page: titles, captions. */
  spanning?: boolean
}

/**
 * Orders a page into reading-order blocks. Single-column pages produce one
 * block; two-column pages are split at the widest empty gutter, with
 * full-width lines (titles, figure captions) kept as their own blocks so that
 * a spanning element does not get interleaved into a column.
 */
export function orderLines(page: RawPage): Block[] {
  const lines = [...page.lines].sort((a, b) => b.y - a.y || a.x0 - b.x0)
  if (lines.length < 6) return lines.length ? [{ column: 0, lines }] : []

  const gutter = findGutter(page, lines)
  if (gutter === null) return [{ column: 0, lines }]

  const blocks: Block[] = []
  let left: RawLine[] = []
  let right: RawLine[] = []
  let spanning: RawLine[] = []
  const flushColumns = () => {
    if (left.length) blocks.push({ column: 0, lines: left })
    if (right.length) blocks.push({ column: 1, lines: right })
    left = []
    right = []
  }
  const flushSpanning = () => {
    if (spanning.length) blocks.push({ column: 0, lines: spanning, spanning: true })
    spanning = []
  }

  for (const line of lines) {
    if (line.x0 < gutter && line.x1 > gutter) {
      // Spans the gutter: close the columns above it and keep it separate.
      flushColumns()
      spanning.push(line)
    } else {
      flushSpanning()
      if (line.x1 <= gutter) left.push(line)
      else right.push(line)
    }
  }
  flushSpanning()
  flushColumns()
  return blocks
}

/** Returns the x of an empty vertical gutter near the middle of the page, if any. */
function findGutter(page: RawPage, lines: RawLine[]): number | null {
  let best: { x: number; crossings: number; balance: number } | null = null
  for (let fraction = 0.35; fraction <= 0.65; fraction += 0.01) {
    const x = page.width * fraction
    let crossings = 0
    let leftCount = 0
    let rightCount = 0
    for (const line of lines) {
      if (line.x0 < x && line.x1 > x) crossings++
      else if (line.x1 <= x) leftCount++
      else rightCount++
    }
    const balance = Math.min(leftCount, rightCount) / lines.length
    if (!best || crossings < best.crossings || (crossings === best.crossings && balance > best.balance)) {
      best = { x, crossings, balance }
    }
  }
  if (!best) return null
  // Demand a near-empty gutter and a genuine split, otherwise call it one
  // column. A little slack in the crossing count covers spanning elements such
  // as a centred title or a wide figure, which `orderLines` pulls out anyway.
  return best.crossings / lines.length <= 0.15 && best.balance >= 0.2 ? best.x : null
}

function startsParagraph(
  line: RawLine,
  previous: RawLine | undefined,
  gap: number,
  left: number,
  right: number,
  width: number,
): boolean {
  if (!previous) return true
  const verticalGap = previous.y - line.y
  if (gap > 0 && verticalGap > gap * 1.5) return true
  // First-line indent.
  if (line.x0 - left > width * 0.03 && line.x0 - left < width * 0.25) return true
  // Previous line ended a sentence well short of the right margin.
  if (SENTENCE_END.test(previous.text) && previous.x1 < right - width * 0.12) return true
  return false
}

function isHeading(line: RawLine, bodyFontSize: number, width: number): boolean {
  if (line.text.length > 90) return false
  if (/^(chapter|part|section|appendix|prologue|epilogue)\b/i.test(line.text)) return true
  const big = line.fontSize >= bodyFontSize * 1.18
  const short = line.x1 - line.x0 < width * 0.75
  return big && short && !SENTENCE_END.test(line.text)
}

function isMarginNoise(line: RawLine, page: RawPage, repeated: Set<string>): boolean {
  const inMargin = line.y > page.height * 0.92 || line.y < page.height * 0.08
  if (!inMargin) return false
  if (/^(page\s+)?[ivxlcdm\d]{1,6}$/i.test(line.text)) return true
  return repeated.has(normalizeMargin(line.text))
}

function isFootnote(line: RawLine, page: RawPage, bodyFontSize: number): boolean {
  const small = line.fontSize <= bodyFontSize * 0.86
  const low = line.y < page.height * 0.28
  return small && low
}

/**
 * Header/footer text repeats across pages with only the page number changing,
 * so lines are compared with digits masked out.
 */
export function findRepeatedMarginLines(pages: RawPage[]): Set<string> {
  const counts = new Map<string, number>()
  for (const page of pages) {
    const candidates = page.lines.filter(
      (line) => line.y > page.height * 0.92 || line.y < page.height * 0.08,
    )
    for (const key of new Set(candidates.map((line) => normalizeMargin(line.text)))) {
      if (key) counts.set(key, (counts.get(key) ?? 0) + 1)
    }
  }
  // Recto/verso headers only appear on half the pages, so the bar is low; very
  // short documents would never clear a fixed minimum of three.
  const threshold = pages.length <= 4 ? 2 : Math.max(3, Math.ceil(pages.length * 0.25))
  return new Set([...counts].filter(([, count]) => count >= threshold).map(([key]) => key))
}

function normalizeMargin(text: string): string {
  return text
    .toLowerCase()
    .replace(/\d+/g, '#')
    .replace(/\s+/g, ' ')
    .trim()
}

/** Joins lines, repairing words split by an end-of-line hyphen. */
export function joinLines(lines: RawLine[]): string {
  let out = ''
  lines.forEach((line, i) => {
    const text = line.text.trim()
    if (!text) return
    if (i === 0) {
      out = text
      return
    }
    if (/[‐-—-]$/.test(out) && /^[a-z]/.test(text)) {
      out = out.replace(/[‐-—-]$/, '') + text
    } else {
      out += ' ' + text
    }
  })
  return out.replace(/\s+/g, ' ').trim()
}

function medianFontSize(lines: RawLine[]): number {
  if (!lines.length) return 10
  // Weighted by characters so a handful of huge title glyphs cannot skew it.
  const sizes: number[] = []
  for (const line of lines) {
    const weight = Math.max(1, Math.round(line.text.length / 10))
    for (let i = 0; i < weight; i++) sizes.push(line.fontSize)
  }
  sizes.sort((a, b) => a - b)
  return sizes[Math.floor(sizes.length / 2)]
}

function medianGap(lines: RawLine[]): number {
  const gaps: number[] = []
  for (let i = 1; i < lines.length; i++) {
    const gap = lines[i - 1].y - lines[i].y
    if (gap > 0) gaps.push(gap)
  }
  if (!gaps.length) return 0
  gaps.sort((a, b) => a - b)
  return gaps[Math.floor(gaps.length / 2)]
}
