import type { TextItem } from 'pdfjs-dist/types/src/display/api'
import type { RawLine } from './types'

/** Horizontal gap, in multiples of the font size, that ends a line. */
const COLUMN_GAP_EM = 3.5

/**
 * Items come back roughly in reading order but split at every style change, so
 * they are re-grouped by baseline. Two items belong to the same line when their
 * baselines are within a fraction of the font height of each other.
 */
export function groupIntoLines(items: TextItem[], pageNumber: number): RawLine[] {
  const placed = items
    .filter((item) => item.str.length > 0)
    .map((item) => {
      const fontSize = Math.abs(item.transform[3]) || item.height || 10
      const x0 = item.transform[4]
      return { item, fontSize, x0, x1: x0 + (item.width ?? 0), y: item.transform[5] }
    })
    // Top to bottom, then left to right.
    .sort((a, b) => b.y - a.y || a.x0 - b.x0)

  const lines: RawLine[] = []
  let current: RawLine | null = null
  let lastX1 = 0

  for (const entry of placed) {
    const tolerance = Math.max(1.5, entry.fontSize * 0.4)
    const gap = current ? entry.x0 - lastX1 : 0
    // A gap of several em on the same baseline is a column gutter or a table
    // cell boundary, not a word space: keeping them apart is what lets
    // `orderLines` put a two-column page back into reading order.
    const sameLine =
      current && Math.abs(current.y - entry.y) <= tolerance && gap < entry.fontSize * COLUMN_GAP_EM
    if (current && sameLine) {
      const needsSpace =
        gap > entry.fontSize * 0.2 && !/\s$/.test(current.text) && !/^\s/.test(entry.item.str)
      current.text += (needsSpace ? ' ' : '') + entry.item.str
      current.x1 = Math.max(current.x1, entry.x1)
      current.fontSize = Math.max(current.fontSize, entry.fontSize)
    } else {
      if (current) pushLine(lines, current)
      current = {
        text: entry.item.str,
        x0: entry.x0,
        x1: entry.x1,
        y: entry.y,
        fontSize: entry.fontSize,
        page: pageNumber,
      }
    }
    lastX1 = entry.x1
  }
  if (current) pushLine(lines, current)
  return lines
}

function pushLine(lines: RawLine[], line: RawLine): void {
  const text = line.text.replace(/\s+/g, ' ').trim()
  if (text) lines.push({ ...line, text })
}
