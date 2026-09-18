import { toSpeech, tokenAtOffset } from '../lib/text/normalize'
import type { SpeechHandle, TtsProvider } from '../lib/tts'
import type { Chunk } from '../lib/pdf/types'

/**
 * Silences a narrator actually leaves, in milliseconds.
 *
 * Chunks are a synthesis detail, not a unit of speech: a paragraph split into
 * three chunks should be read as one breath. These are the only places the
 * narration should stop.
 */
export const PAUSES = {
  paragraph: 420,
  beforeHeading: 900,
  afterHeading: 650,
}

/** Headings are read slightly slower than body text, the way a narrator marks them. */
export const HEADING_RATE = 0.94

/** How many chunks may sit queued ahead of the one being spoken. */
const LOOKAHEAD = 3

/** The silence owed before `chunk`, given what came before it. */
export function pauseBefore(chunk: Chunk | undefined, previous: Chunk | undefined): number {
  if (!chunk || !previous) return 0
  if (chunk.heading) return PAUSES.beforeHeading
  if (previous.heading) return PAUSES.afterHeading
  if (chunk.startsParagraph) return PAUSES.paragraph
  return 0
}

export function rateFor(chunk: Chunk, rate: number): number {
  return chunk.heading ? rate * HEADING_RATE : rate
}

export interface NarrationCallbacks {
  onIndex: (index: number) => void
  onToken: (tokenIndex: number) => void
  onError: (message: string) => void
  onFinished: () => void
}

export interface NarrationOptions {
  provider: TtsProvider
  chunks: Chunk[]
  bookId: string
  voiceId: string | null
  rate: number
  callbacks: NarrationCallbacks
}

/**
 * Drives continuous narration over a book's chunks.
 *
 * Where the text runs on, the next chunk is handed to the engine before the
 * current one finishes, so it plays straight through with no seam. Where a
 * narrator would breathe — a new paragraph, either side of a heading — the
 * queue is deliberately broken and the silence is timed.
 */
export class Narration {
  private handles: SpeechHandle[] = []
  private timer: ReturnType<typeof setTimeout> | null = null
  /** Highest chunk index handed to the engine. */
  private queuedTo = -1
  /** Chunk currently being spoken. */
  private speaking = -1
  private paused = false
  private stopped = false

  constructor(private readonly options: NarrationOptions) {}

  start(from: number): void {
    this.stopped = false
    this.speaking = -1
    this.queuedTo = from - 1
    this.speak(from, false, 0)
  }

  stop(): void {
    this.stopped = true
    this.clearTimer()
    for (const handle of this.handles) handle.stop()
    this.handles = []
    this.queuedTo = -1
    this.speaking = -1
  }

  pause(): void {
    this.paused = true
    for (const handle of this.handles) handle.pause()
  }

  resume(): void {
    this.paused = false
    for (const handle of this.handles) handle.resume()
  }

  private speak(index: number, append: boolean, depth: number): void {
    const { chunks, provider, voiceId, rate, bookId, callbacks } = this.options
    const chunk = chunks[index]
    if (!chunk) {
      callbacks.onFinished()
      return
    }

    const speech = toSpeech(chunk.text)
    if (!speech.text) {
      // Nothing speakable in this chunk (a stray citation, a bullet glyph).
      this.speak(index + 1, append, depth)
      return
    }

    this.queuedTo = Math.max(this.queuedTo, index)

    const handle = provider.speak({
      text: speech.text,
      rate: rateFor(chunk, rate),
      voiceId,
      append,
      cacheKey: `${bookId}:${chunk.index}`,
      onStart: () => {
        if (this.stopped) return
        this.speaking = index
        callbacks.onToken(-1)
        callbacks.onIndex(index)
      },
      onBoundary: (charIndex) => {
        if (this.stopped || this.speaking !== index) return
        callbacks.onToken(tokenAtOffset(speech, charIndex))
      },
      onEnd: (error) => {
        if (this.stopped) return
        this.release(handle)
        if (error) {
          callbacks.onError(error.message)
          return
        }
        this.afterChunk(index)
      },
    })

    this.handles.push(handle)
    if (this.paused) handle.pause()

    // Hand over the rest of the same breath now, so the engine never stops.
    this.queueContinuation(index, depth)
  }

  /** Queues the following chunk when it belongs to the same breath as `from`. */
  private queueContinuation(from: number, depth: number): void {
    const { chunks, provider } = this.options
    if (!provider.supportsQueueing) return
    if (depth >= LOOKAHEAD) return
    if (this.queuedTo > from) return
    const next = chunks[from + 1]
    if (!next || pauseBefore(next, chunks[from]) > 0) return
    this.speak(from + 1, true, depth + 1)
  }

  private afterChunk(index: number): void {
    const { chunks, callbacks } = this.options
    const next = chunks[index + 1]
    if (!next) {
      callbacks.onFinished()
      return
    }

    const gap = pauseBefore(next, chunks[index])
    if (gap === 0 && this.queuedTo > index) {
      // Already playing straight on; just keep the queue topped up.
      this.queueContinuation(this.queuedTo, 0)
      return
    }

    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      if (!this.stopped) this.speak(index + 1, false, 0)
    }, gap)
  }

  private release(handle: SpeechHandle): void {
    this.handles = this.handles.filter((item) => item !== handle)
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
