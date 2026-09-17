import { describe, expect, it } from 'vitest'
import { buildChapters } from './chapters'
import type { Chunk, OutlineEntry } from './types'

function chunk(index: number, page: number, text: string, heading = false): Chunk {
  return { index, text, page, paragraph: index, startsParagraph: true, ...(heading ? { heading: true } : {}) }
}

describe('buildChapters', () => {
  const chunks = [
    chunk(0, 1, 'Front matter about the publisher.'),
    chunk(1, 3, 'Chapter One', true),
    chunk(2, 3, 'It was a bright cold day in April.'),
    chunk(3, 9, 'Chapter Two', true),
    chunk(4, 9, 'Outside the world looked cold.'),
  ]

  it('prefers the PDF outline and anchors each entry to its page', () => {
    const outline: OutlineEntry[] = [
      { title: 'Chapter One', page: 3, level: 0 },
      { title: 'Chapter Two', page: 9, level: 0 },
    ]
    expect(buildChapters(chunks, outline)).toEqual([
      { title: 'Beginning', chunkIndex: 0, page: 1, level: 0 },
      { title: 'Chapter One', chunkIndex: 1, page: 3, level: 0 },
      { title: 'Chapter Two', chunkIndex: 3, page: 9, level: 0 },
    ])
  })

  it('falls back to detected headings when there is no outline', () => {
    expect(buildChapters(chunks, []).map((chapter) => chapter.title)).toEqual([
      'Beginning',
      'Chapter One',
      'Chapter Two',
    ])
  })

  it('ignores outline entries whose destination could not be resolved', () => {
    const outline: OutlineEntry[] = [
      { title: 'Chapter One', page: null, level: 0 },
      { title: 'Chapter Two', page: null, level: 0 },
    ]
    // Nothing usable in the outline, so headings are used instead.
    expect(buildChapters(chunks, outline)).toHaveLength(3)
  })

  it('returns nothing for an empty book', () => {
    expect(buildChapters([], [])).toEqual([])
  })
})
