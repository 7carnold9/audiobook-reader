import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HEADING_RATE, Narration, PAUSES, pauseBefore, rateFor } from './narration'
import type { SpeakOptions, SpeechHandle, TtsProvider, TtsVoice } from '../lib/tts'
import type { Chunk } from '../lib/pdf/types'

function chunk(index: number, text: string, extra: Partial<Chunk> = {}): Chunk {
  return { index, text, page: 1, paragraph: 0, startsParagraph: false, ...extra }
}

/** A stand-in engine: records what it was asked to say and when it was asked. */
function fakeProvider(supportsQueueing = true) {
  const spoken: (SpeakOptions & { order: number })[] = []
  const stopped: number[] = []
  let order = 0

  const provider: TtsProvider = {
    id: 'fake',
    name: 'Fake',
    supportsBoundaries: true,
    supportsQueueing,
    isAvailable: () => true,
    listVoices: async (): Promise<TtsVoice[]> => [],
    speak: (options) => {
      const position = order++
      spoken.push({ ...options, order: position })
      const handle: SpeechHandle = {
        stop: () => stopped.push(position),
        pause: () => undefined,
        resume: () => undefined,
      }
      return handle
    },
  }

  return {
    provider,
    spoken,
    stopped,
    /** Simulate the engine reaching, then finishing, a queued request. */
    run: (position: number) => {
      spoken[position].onStart?.()
      spoken[position].onEnd()
    },
    fail: (position: number, message: string) => spoken[position].onEnd(new Error(message)),
    texts: () => spoken.map((item) => item.text),
  }
}

function callbacks() {
  return {
    onIndex: vi.fn(),
    onToken: vi.fn(),
    onError: vi.fn(),
    onFinished: vi.fn(),
  }
}

describe('pauseBefore', () => {
  const body = chunk(0, 'Body.')
  it('runs straight on inside a paragraph', () => {
    expect(pauseBefore(chunk(1, 'More.'), body)).toBe(0)
  })

  it('breathes at a new paragraph', () => {
    expect(pauseBefore(chunk(1, 'New.', { startsParagraph: true }), body)).toBe(PAUSES.paragraph)
  })

  it('leaves a longer beat either side of a heading', () => {
    const heading = chunk(1, 'Chapter Two', { heading: true, startsParagraph: true })
    expect(pauseBefore(heading, body)).toBe(PAUSES.beforeHeading)
    expect(pauseBefore(chunk(2, 'After.', { startsParagraph: true }), heading)).toBe(
      PAUSES.afterHeading,
    )
  })

  it('does not pause before the very first chunk', () => {
    expect(pauseBefore(body, undefined)).toBe(0)
  })
})

describe('rateFor', () => {
  it('slows headings only', () => {
    expect(rateFor(chunk(0, 'Chapter', { heading: true }), 1)).toBeCloseTo(HEADING_RATE)
    expect(rateFor(chunk(0, 'Body'), 1.5)).toBe(1.5)
  })
})

describe('Narration', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  // Two chunks of one paragraph, then a new paragraph, then a heading.
  const chunks = [
    chunk(0, 'First half of the paragraph.', { startsParagraph: true }),
    chunk(1, 'Second half of the same paragraph.'),
    chunk(2, 'A new paragraph starts here.', { startsParagraph: true }),
    chunk(3, 'Chapter Two', { heading: true, startsParagraph: true }),
  ]

  const narrate = (engine: ReturnType<typeof fakeProvider>, events = callbacks()) => {
    const narration = new Narration({
      provider: engine.provider,
      chunks,
      bookId: 'book',
      voiceId: 'voice',
      rate: 1,
      callbacks: events,
    })
    return { narration, events }
  }

  it('hands the rest of the paragraph to the engine before the first chunk ends', () => {
    const engine = fakeProvider()
    const { narration } = narrate(engine)
    narration.start(0)

    // Both chunks of the paragraph are queued straight away, the second appended.
    expect(engine.texts()).toEqual([
      'First half of the paragraph.',
      'Second half of the same paragraph.',
    ])
    expect(engine.spoken[0].append).toBe(false)
    expect(engine.spoken[1].append).toBe(true)
  })

  it('does not queue across a paragraph break, and times the silence', () => {
    const engine = fakeProvider()
    const { narration, events } = narrate(engine)
    narration.start(0)
    engine.run(0)
    engine.run(1)

    // The new paragraph is not queued behind the old one.
    expect(engine.spoken).toHaveLength(2)

    vi.advanceTimersByTime(PAUSES.paragraph - 1)
    expect(engine.spoken).toHaveLength(2)

    vi.advanceTimersByTime(1)
    expect(engine.texts()[2]).toBe('A new paragraph starts here.')
    expect(engine.spoken[2].append).toBe(false)

    engine.spoken[2].onStart?.()
    expect(events.onIndex).toHaveBeenLastCalledWith(2)
  })

  it('leaves a longer silence before a heading and reads it slower', () => {
    const engine = fakeProvider()
    const { narration } = narrate(engine)
    narration.start(2)
    engine.run(0)

    vi.advanceTimersByTime(PAUSES.paragraph)
    expect(engine.spoken).toHaveLength(1)

    vi.advanceTimersByTime(PAUSES.beforeHeading - PAUSES.paragraph)
    expect(engine.texts()[1]).toBe('Chapter Two')
    expect(engine.spoken[1].rate).toBeCloseTo(HEADING_RATE)
  })

  it('speaks sequentially when the engine cannot queue', () => {
    const engine = fakeProvider(false)
    const { narration } = narrate(engine)
    narration.start(0)

    expect(engine.spoken).toHaveLength(1)
    engine.run(0)
    vi.advanceTimersByTime(0)
    expect(engine.texts()[1]).toBe('Second half of the same paragraph.')
    expect(engine.spoken[1].append).toBe(false)
  })

  it('reports the finish once the last chunk ends', () => {
    const engine = fakeProvider()
    const { narration, events } = narrate(engine)
    narration.start(3)
    engine.run(0)
    expect(events.onFinished).toHaveBeenCalled()
  })

  it('surfaces an engine error instead of carrying on', () => {
    const engine = fakeProvider()
    const { narration, events } = narrate(engine)
    narration.start(0)
    engine.fail(0, 'no voices installed')

    expect(events.onError).toHaveBeenCalledWith('no voices installed')
    vi.advanceTimersByTime(5000)
    expect(engine.spoken).toHaveLength(2) // only what was already queued
  })

  it('stops everything, including a pending silence', () => {
    const engine = fakeProvider()
    const { narration, events } = narrate(engine)
    narration.start(0)
    engine.run(0)
    engine.run(1)

    narration.stop()
    vi.advanceTimersByTime(5000)

    expect(engine.spoken).toHaveLength(2)
    expect(events.onIndex).not.toHaveBeenCalledWith(2)
  })

  it('stops a chunk that is still speaking', () => {
    const engine = fakeProvider()
    const { narration } = narrate(engine)
    narration.start(0)
    engine.spoken[0].onStart?.()

    narration.stop()
    // Both the speaking chunk and the one queued behind it are cancelled.
    expect(engine.stopped).toEqual([0, 1])
  })

  it('ignores callbacks that arrive after a stop', () => {
    const engine = fakeProvider()
    const { narration, events } = narrate(engine)
    narration.start(0)
    narration.stop()

    engine.spoken[0].onStart?.()
    engine.spoken[0].onBoundary?.(0)
    expect(events.onIndex).not.toHaveBeenCalled()
    expect(events.onToken).not.toHaveBeenCalled()
  })

  it('only highlights words for the chunk actually speaking', () => {
    const engine = fakeProvider()
    const { narration, events } = narrate(engine)
    narration.start(0)

    // The queued second chunk reports a boundary before its turn; ignore it.
    engine.spoken[1].onBoundary?.(0)
    expect(events.onToken).not.toHaveBeenCalledWith(expect.any(Number))

    engine.spoken[0].onStart?.()
    engine.spoken[0].onBoundary?.(0)
    expect(events.onToken).toHaveBeenLastCalledWith(0)
  })
})

describe('Narration starting partway through a chunk', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const chunks = [
    chunk(0, 'It was a bright cold day in April.', { startsParagraph: true }),
    chunk(1, 'The clocks were striking thirteen.'),
  ]

  const narrate = (engine: ReturnType<typeof fakeProvider>, events = callbacks()) => ({
    narration: new Narration({
      provider: engine.provider,
      chunks,
      bookId: 'book',
      voiceId: null,
      rate: 1,
      callbacks: events,
    }),
    events,
  })

  it('speaks only from the chosen word onwards', () => {
    const engine = fakeProvider()
    const { narration } = narrate(engine)
    narration.start(0, 3) // "bright"

    expect(engine.texts()[0]).toBe('bright cold day in April.')
  })

  it('reports highlight positions in the whole chunk, not the fragment', () => {
    const engine = fakeProvider()
    const { narration, events } = narrate(engine)
    narration.start(0, 3)

    engine.spoken[0].onStart?.()
    expect(events.onToken).toHaveBeenLastCalledWith(3)

    // Offset 7 in "bright cold day in April." is "cold", the 5th word overall.
    engine.spoken[0].onBoundary?.(7)
    expect(events.onToken).toHaveBeenLastCalledWith(4)
  })

  it('reads the following chunks in full', () => {
    const engine = fakeProvider()
    const { narration } = narrate(engine)
    narration.start(0, 3)

    expect(engine.texts()[1]).toBe('The clocks were striking thirteen.')
  })

  it('moves to the next chunk when the click lands past the last word', () => {
    const engine = fakeProvider()
    const { narration } = narrate(engine)
    narration.start(0, 99)

    expect(engine.texts()[0]).toBe('The clocks were striking thirteen.')
  })
})
