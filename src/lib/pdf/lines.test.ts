import { describe, expect, it } from 'vitest'
import { groupIntoLines } from './lines'

type Item = Parameters<typeof groupIntoLines>[0][number]

function item(str: string, x: number, y: number, width: number, size = 10): Item {
  return {
    str,
    dir: 'ltr',
    width,
    height: size,
    transform: [size, 0, 0, size, x, y],
    fontName: 'test',
    hasEOL: false,
  } as Item
}

describe('groupIntoLines', () => {
  it('joins runs that share a baseline, inserting spaces where there is a gap', () => {
    const lines = groupIntoLines([item('Hello', 72, 700, 30), item('world', 105, 700, 30)], 1)
    expect(lines).toHaveLength(1)
    expect(lines[0].text).toBe('Hello world')
    expect(lines[0].x1).toBeCloseTo(135)
  })

  it('does not insert a space between runs that touch', () => {
    const lines = groupIntoLines([item('Wins', 72, 700, 20), item('ton', 92, 700, 15)], 1)
    expect(lines[0].text).toBe('Winston')
  })

  it('splits at a column gutter on the same baseline', () => {
    const lines = groupIntoLines(
      [item('left column text', 60, 700, 220), item('right column text', 320, 700, 220)],
      1,
    )
    expect(lines.map((line) => line.text)).toEqual(['left column text', 'right column text'])
  })

  it('orders lines from the top of the page down', () => {
    const lines = groupIntoLines([item('second', 72, 680, 40), item('first', 72, 700, 40)], 1)
    expect(lines.map((line) => line.text)).toEqual(['first', 'second'])
  })
})
