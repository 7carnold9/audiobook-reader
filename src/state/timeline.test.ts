import { describe, expect, it } from 'vitest'
import { buildTimeline, chunkAtSeconds } from './usePlayer'
import type { Chunk } from '../lib/pdf/types'

function chunk(index: number, words: number): Chunk {
  return {
    index,
    text: Array.from({ length: words }, () => 'word').join(' '),
    page: 1,
    paragraph: index,
    startsParagraph: true,
  }
}

describe('buildTimeline', () => {
  it('estimates a running time from the word counts', () => {
    const timeline = buildTimeline([chunk(0, 165), chunk(1, 165)])
    // 165 words per minute at 1x, so one minute per chunk.
    expect(timeline.durations).toEqual([60, 60])
    expect(timeline.starts).toEqual([0, 60])
    expect(timeline.total).toBe(120)
  })

  it('handles an empty book', () => {
    expect(buildTimeline([])).toEqual({ starts: [], durations: [], total: 0 })
  })
})

describe('chunkAtSeconds', () => {
  const timeline = buildTimeline([chunk(0, 165), chunk(1, 165), chunk(2, 165)])

  it('finds the chunk playing at a given moment', () => {
    expect(chunkAtSeconds(timeline, 0)).toBe(0)
    expect(chunkAtSeconds(timeline, 59)).toBe(0)
    expect(chunkAtSeconds(timeline, 60)).toBe(1)
    expect(chunkAtSeconds(timeline, 121)).toBe(2)
  })

  it('clamps a negative position to the start', () => {
    expect(chunkAtSeconds(timeline, -10)).toBe(0)
  })
})
