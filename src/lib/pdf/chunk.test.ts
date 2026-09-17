import { describe, expect, it } from 'vitest'
import { chunkParagraphs, splitSentences } from './chunk'
import type { Paragraph } from './types'

describe('splitSentences', () => {
  it('splits on sentence ends', () => {
    expect(splitSentences('One thing happened. Then another! And a third?')).toEqual([
      'One thing happened.',
      'Then another!',
      'And a third?',
    ])
  })

  it('does not split on abbreviations, initials or decimals', () => {
    expect(splitSentences('See Fig. 2 for details.')).toEqual(['See Fig. 2 for details.'])
    expect(splitSentences('Written by J. R. R. Tolkien in 1937.')).toEqual([
      'Written by J. R. R. Tolkien in 1937.',
    ])
    expect(splitSentences('Version 2.1 shipped. It was late.')).toEqual([
      'Version 2.1 shipped.',
      'It was late.',
    ])
    expect(splitSentences('Reported by Chen et al. in a later paper.')).toEqual([
      'Reported by Chen et al. in a later paper.',
    ])
  })

  it('keeps closing quotes with the sentence they end', () => {
    expect(splitSentences('"Go away." She left.')).toEqual(['"Go away."', 'She left.'])
  })
})

describe('chunkParagraphs', () => {
  const paragraph = (text: string, page = 1, heading = false): Paragraph => ({
    text,
    page,
    ...(heading ? { heading: true } : {}),
  })

  it('keeps short paragraphs whole and numbers chunks sequentially', () => {
    const chunks = chunkParagraphs([paragraph('First one.'), paragraph('Second one.', 2)])
    expect(chunks.map((chunk) => [chunk.index, chunk.text, chunk.page])).toEqual([
      [0, 'First one.', 1],
      [1, 'Second one.', 2],
    ])
    expect(chunks.every((chunk) => chunk.startsParagraph)).toBe(true)
  })

  it('splits a long paragraph at sentence boundaries', () => {
    const sentence = 'The quick brown fox jumped over the lazy dog and kept on running. '
    const chunks = chunkParagraphs([paragraph(sentence.repeat(12).trim())])
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.text.length <= 480)).toBe(true)
    expect(chunks.every((chunk) => chunk.text.endsWith('running.'))).toBe(true)
    expect(chunks[0].startsParagraph).toBe(true)
    expect(chunks[1].startsParagraph).toBe(false)
    // Nothing is lost in the split.
    expect(chunks.map((chunk) => chunk.text).join(' ')).toBe(sentence.repeat(12).trim())
  })

  it('splits a sentence that is longer than the hard limit', () => {
    const monster = `${'word '.repeat(200).trim()}.`
    const chunks = chunkParagraphs([paragraph(monster)])
    expect(chunks.length).toBeGreaterThan(1)
    expect(chunks.every((chunk) => chunk.text.length <= 480)).toBe(true)
  })

  it('never splits a heading', () => {
    const chunks = chunkParagraphs([paragraph('Chapter One. The Beginning.', 1, true)])
    expect(chunks).toHaveLength(1)
    expect(chunks[0].heading).toBe(true)
  })
})
