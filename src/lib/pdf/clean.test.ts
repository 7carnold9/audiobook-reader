import { describe, expect, it } from 'vitest'
import { cleanPages, findRepeatedMarginLines, joinLines, orderLines } from './clean'
import type { RawLine, RawPage } from './types'

const PAGE_HEIGHT = 792
const PAGE_WIDTH = 612

function line(text: string, y: number, x0 = 72, x1 = 540, fontSize = 11, page = 1): RawLine {
  return { text, x0, x1, y, fontSize, page }
}

function page(lines: RawLine[], number = 1): RawPage {
  return { page: number, width: PAGE_WIDTH, height: PAGE_HEIGHT, lines }
}

describe('joinLines', () => {
  it('repairs words broken by an end-of-line hyphen', () => {
    expect(joinLines([line('striking thir-', 700), line('teen. Winston', 685)])).toBe(
      'striking thirteen. Winston',
    )
  })

  it('keeps a hyphen that ends a line before a capitalised word', () => {
    expect(joinLines([line('the Anglo-', 700), line('French treaty', 685)])).toBe(
      'the Anglo- French treaty',
    )
  })
})

describe('findRepeatedMarginLines', () => {
  it('finds running headers whose page number changes', () => {
    const pages = [1, 2, 3, 4, 5].map((number) =>
      page(
        [
          line('NINETEEN EIGHTY-FOUR', PAGE_HEIGHT - 40, 72, 240, 9, number),
          line('Body text on the page.', 400, 72, 540, 11, number),
          line(`Chapter 3 · page ${number}`, 30, 72, 240, 9, number),
        ],
        number,
      ),
    )
    const repeated = findRepeatedMarginLines(pages)
    expect(repeated.has('nineteen eighty-four')).toBe(true)
    expect(repeated.has('chapter # · page #')).toBe(true)
  })

  it('does not treat body text as a header', () => {
    const pages = [1, 2, 3].map((number) => page([line('Body text', 400, 72, 540, 11, number)], number))
    expect(findRepeatedMarginLines(pages).size).toBe(0)
  })
})

describe('orderLines', () => {
  it('reads a two-column page column by column', () => {
    const left = [0, 1, 2, 3].map((i) => line(`left ${i}`, 700 - i * 14, 60, 290))
    const right = [0, 1, 2, 3].map((i) => line(`right ${i}`, 700 - i * 14, 320, 550))
    const blocks = orderLines(page([...left, ...right]))
    expect(blocks.flatMap((block) => block.lines.map((item) => item.text))).toEqual([
      'left 0', 'left 1', 'left 2', 'left 3',
      'right 0', 'right 1', 'right 2', 'right 3',
    ])
  })

  it('keeps a full-width line above the columns it precedes', () => {
    const title = line('A Title Spanning Both Columns', 730, 100, 500, 17)
    const left = [0, 1, 2].map((i) => line(`left ${i}`, 700 - i * 14, 60, 290))
    const right = [0, 1, 2].map((i) => line(`right ${i}`, 700 - i * 14, 320, 550))
    const blocks = orderLines(page([title, ...left, ...right]))
    expect(blocks[0].lines[0].text).toBe('A Title Spanning Both Columns')
    expect(blocks.flatMap((block) => block.lines.map((item) => item.text)).slice(1, 4)).toEqual([
      'left 0', 'left 1', 'left 2',
    ])
  })

  it('leaves a single-column page alone', () => {
    const lines = [0, 1, 2, 3, 4, 5].map((i) => line(`line ${i}`, 700 - i * 14))
    const blocks = orderLines(page(lines))
    expect(blocks).toHaveLength(1)
    expect(blocks[0].lines.map((item) => item.text)).toEqual(lines.map((item) => item.text))
  })
})

describe('cleanPages', () => {
  it('drops repeated headers, page numbers and footnotes', () => {
    const pages = [1, 2, 3, 4].map((number) =>
      page(
        [
          line('A Short History of Nearly Everything', PAGE_HEIGHT - 30, 72, 300, 9, number),
          line('The body of the page continues here and says something.', 600, 72, 540, 11, number),
          line('1 A footnote in smaller type.', 120, 72, 300, 7, number),
          line(String(number), 30, 300, 312, 9, number),
        ],
        number,
      ),
    )
    const { paragraphs, stats } = cleanPages(pages)
    const text = paragraphs.map((paragraph) => paragraph.text).join(' ')
    expect(text).not.toMatch(/Short History/)
    expect(text).not.toMatch(/footnote/)
    expect(text).toMatch(/body of the page/)
    expect(stats.droppedMarginLines).toBeGreaterThanOrEqual(8)
    expect(stats.droppedFootnoteLines).toBe(4)
  })

  it('starts a new paragraph at an indented first line', () => {
    const pages = [
      page([
        line('The first paragraph runs to the right margin and keeps going.', 700),
        line('It continues on a second line here.', 686),
        line('A new paragraph begins, indented.', 672, 90),
        line('and carries on to this line.', 658),
      ]),
    ]
    const { paragraphs } = cleanPages(pages)
    expect(paragraphs).toHaveLength(2)
    expect(paragraphs[1].text).toBe('A new paragraph begins, indented. and carries on to this line.')
  })

  it('marks larger, short lines as headings', () => {
    const pages = [
      page([
        line('Chapter One', 720, 72, 180, 16),
        line('The body text of the chapter starts here and runs on.', 690),
        line('It keeps going on a second line.', 676),
      ]),
    ]
    const { paragraphs } = cleanPages(pages)
    expect(paragraphs[0]).toMatchObject({ text: 'Chapter One', heading: true })
    expect(paragraphs[1].heading).toBeUndefined()
  })

  it('lets a paragraph continue across a page break', () => {
    const pages = [
      page([line('A sentence that stops mid-thought and', 100)], 1),
      page([line('finishes on the following page.', 700, 72, 300, 11, 2)], 2),
    ]
    const { paragraphs } = cleanPages(pages)
    expect(paragraphs).toHaveLength(1)
    expect(paragraphs[0].text).toBe('A sentence that stops mid-thought and finishes on the following page.')
  })
})
