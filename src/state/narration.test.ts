import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { HEADING_RATE, Narration, PAUSES, pauseBefore, rateFor, speechUnits } from './narration'
import type { SpeakOptions, SpeechHandle, TtsProvider, TtsVoice } from '../lib/tts'
import type { Chunk } from '../lib/pdf/types'

function chunk(index: number, text: string, extra: Partial<Chunk> = {}): Chunk {
  return { index, text, page: 1, paragraph: 0, startsParagraph: false, ...extra }
}

/** A stand-in engine: records what it was asked to say, and when. */
function fakeProvider(supportsQueueing = true) {
  const spoken: SpeakOptions[] = []
  const stopped: string[] = []

  const provider: TtsProvider = {
    id: 'fake',
    name: 'Fake',
    supportsBoundaries: true,
    supportsQueueing,
    isAvailable: () => true,
    listVoices: async (): Promise<TtsVoice[]> => [],
    speak: (options) => {
      spoken.push(options)
      const handle: SpeechHandle = {
        stop: () => stopped.push(options.text),
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
    run: (position: number) => {
      spoken[position].onStart?.()
      spoken[position].onEnd()
    },
    texts: () => spoken.map((item) => item.text),
  }
}

const callbacks = () => ({
  onIndex: vi.fn(),
  onToken: vi.fn(),
  onError: vi.fn(),
  onFinished: vi.fn(),
})

describe('speechUnits', () => {
  it('splits a chunk into sentences and tracks where each starts', () => {
    expect(speechUnits('It was cold. The clocks struck thirteen.')).toEqual([
      { text: 'It was cold.', tokenStart: 0, tokenCount: 3, endsSentence: true },
      { text: 'The clocks struck thirteen.', tokenStart: 3, tokenCount: 4, endsSentence: true },
    ])
  })

  it('marks a fragment that runs into the next chunk', () => {
    const [unit] = speechUnits('Winston slipped through the glass doors')
    expect(unit.endsSentence).toBe(false)
  })
})

describe('pauseBefore', () => {
  const body = chunk(0, 'Body text.')

  it('leaves structural beats to paragraphs and headings', () => {
    expect(pauseBefore(chunk(1, 'More.'), body)).toBe(0)
    expect(pauseBefore(chunk(1, 'New.', { startsParagraph: true }), body)).toBe(PAUSES.paragraph)
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

  const chunks = [
    // Two sentences in one chunk.
    chunk(0, 'It was a bright cold day. The clocks were striking thirteen.', {
      startsParagraph: true,
    }),
    // A sentence split across a chunk boundary: chunk 1 does not end one.
    chunk(1, 'Winston Smith slipped quickly through'),
    chunk(2, 'the glass doors of Victory Mansions.'),
    chunk(3, 'A new paragraph begins here.', { startsParagraph: true }),
    chunk(4, 'Chapter Two', { heading: true, startsParagraph: true }),
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

  it('speaks one sentence at a time', () => {
    const engine = fakeProvider()
    const { narration } = narrate(engine)
    narration.begin(0)

    expect(engine.texts()[0]).toBe('It was a bright cold day.')
  })

  it('leaves a beat between sentences', () => {
    const engine = fakeProvider()
    const { narration } = narrate(engine)
    narration.begin(0)
    engine.run(0)

    vi.advanceTimersByTime(PAUSES.sentence - 1)
    expect(engine.spoken).toHaveLength(1)

    vi.advanceTimersByTime(1)
    expect(engine.texts()[1]).toBe('The clocks were striking thirteen.')
    expect(engine.spoken[1].append).toBe(false)
  })

  it('never breaks a sentence that runs across chunks', () => {
    const engine = fakeProvider()
    const { narration } = narrate(engine)
    narration.begin(1)

    // The continuation is queued ahead so the engine plays straight through.
    expect(engine.texts()).toEqual([
      'Winston Smith slipped quickly through',
      'the glass doors of Victory Mansions.',
    ])
    expect(engine.spoken[1].append).toBe(true)
  })

  it('leaves a longer beat at a paragraph than between sentences', () => {
    const engine = fakeProvider()
    const { narration } = narrate(engine)
    narration.begin(2)
    engine.run(0)

    vi.advanceTimersByTime(PAUSES.sentence)
    expect(engine.spoken).toHaveLength(1)

    vi.advanceTimersByTime(PAUSES.paragraph - PAUSES.sentence)
    expect(engine.texts()[1]).toBe('A new paragraph begins here.')
  })

  it('leaves the longest beat before a heading, and reads it slower', () => {
    const engine = fakeProvider()
    const { narration } = narrate(engine)
    narration.begin(3)
    engine.run(0)

    vi.advanceTimersByTime(PAUSES.paragraph)
    expect(engine.spoken).toHaveLength(1)

    vi.advanceTimersByTime(PAUSES.beforeHeading - PAUSES.paragraph)
    expect(engine.texts()[1]).toBe('Chapter Two')
    expect(engine.spoken[1].rate).toBeCloseTo(HEADING_RATE)
  })

  it('does not start speaking again while paused', () => {
    const engine = fakeProvider()
    const { narration } = narrate(engine)
    narration.begin(0)
    engine.run(0)

    narration.pause()
    vi.advanceTimersByTime(5_000)
    // The next sentence is held back rather than started and paused, which
    // Chromium would ignore.
    expect(engine.spoken).toHaveLength(1)

    narration.resume()
    expect(engine.texts()[1]).toBe('The clocks were striking thirteen.')
  })

  it('reports the chunk and the word being spoken', () => {
    const engine = fakeProvider()
    const { narration, events } = narrate(engine)
    narration.begin(0)
    engine.spoken[0].onStart?.()

    expect(events.onIndex).toHaveBeenLastCalledWith(0)
    expect(events.onToken).toHaveBeenLastCalledWith(0)

    engine.run(0)
    vi.advanceTimersByTime(PAUSES.sentence)
    engine.spoken[1].onStart?.()
    // The second sentence starts at the sixth word of the chunk.
    expect(events.onToken).toHaveBeenLastCalledWith(6)
  })

  it('speaks sequentially when the engine cannot queue', () => {
    const engine = fakeProvider(false)
    const { narration } = narrate(engine)
    narration.begin(1)

    expect(engine.spoken).toHaveLength(1)
    engine.run(0)
    vi.advanceTimersByTime(0)
    expect(engine.texts()[1]).toBe('the glass doors of Victory Mansions.')
  })

  it('reports the finish after the last chunk', () => {
    const engine = fakeProvider()
    const { narration, events } = narrate(engine)
    narration.begin(4)
    engine.run(0)
    expect(events.onFinished).toHaveBeenCalled()
  })

  it('surfaces an engine error instead of carrying on', () => {
    const engine = fakeProvider()
    const { narration, events } = narrate(engine)
    narration.begin(0)
    engine.spoken[0].onEnd(new Error('no voices installed'))

    expect(events.onError).toHaveBeenCalledWith('no voices installed')
    vi.advanceTimersByTime(5_000)
    expect(engine.spoken).toHaveLength(1)
  })

  it('stops everything, including a pending silence', () => {
    const engine = fakeProvider()
    const { narration, events } = narrate(engine)
    narration.begin(0)
    engine.run(0)

    narration.stop()
    vi.advanceTimersByTime(5_000)
    expect(engine.spoken).toHaveLength(1)
    expect(events.onIndex).not.toHaveBeenCalledWith(1)
  })

  it('cancels what is still speaking', () => {
    const engine = fakeProvider()
    const { narration } = narrate(engine)
    narration.begin(1)
    engine.spoken[0].onStart?.()

    narration.stop()
    expect(engine.stopped).toEqual([
      'Winston Smith slipped quickly through',
      'the glass doors of Victory Mansions.',
    ])
  })

  it('ignores callbacks that arrive after a stop', () => {
    const engine = fakeProvider()
    const { narration, events } = narrate(engine)
    narration.begin(0)
    narration.stop()

    engine.spoken[0].onStart?.()
    engine.spoken[0].onBoundary?.(0)
    expect(events.onIndex).not.toHaveBeenCalled()
    expect(events.onToken).not.toHaveBeenCalled()
  })
})

describe('Narration starting from a chosen word', () => {
  beforeEach(() => vi.useFakeTimers())
  afterEach(() => vi.useRealTimers())

  const chunks = [
    chunk(0, 'It was a bright cold day. The clocks were striking thirteen.', {
      startsParagraph: true,
    }),
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

  it('starts inside the sentence holding that word', () => {
    const engine = fakeProvider()
    const { narration } = narrate(engine)
    narration.begin(0, 3) // "bright"

    expect(engine.texts()[0]).toBe('bright cold day.')
  })

  it('skips to the right sentence for a word later in the chunk', () => {
    const engine = fakeProvider()
    const { narration } = narrate(engine)
    narration.begin(0, 7) // "clocks"

    expect(engine.texts()[0]).toBe('clocks were striking thirteen.')
  })

  it('reports highlight positions against the whole chunk', () => {
    const engine = fakeProvider()
    const { narration, events } = narrate(engine)
    narration.begin(0, 3)

    engine.spoken[0].onStart?.()
    expect(events.onToken).toHaveBeenLastCalledWith(3)

    engine.spoken[0].onBoundary?.('bright '.length)
    expect(events.onToken).toHaveBeenLastCalledWith(4)
  })
})
