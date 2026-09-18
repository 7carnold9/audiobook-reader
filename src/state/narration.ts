import { splitSentences } from '../lib/pdf/chunk'
import { toSpeech, tokenAtOffset } from '../lib/text/normalize'
import type { SpeechHandle, TtsProvider } from '../lib/tts'
import type { Chunk } from '../lib/pdf/types'

/**
 * Silences a narrator actually leaves, in milliseconds.
 *
 * Chunks are a synthesis detail, not a unit of speech. What a listener hears as
 * a beat is the end of a sentence, a paragraph, or a heading — so those are the
 * only places the narration stops, and everything else runs on.
 */
export const PAUSES = {
  sentence: 220,
  paragraph: 460,
  beforeHeading: 900,
  afterHeading: 650,
}

/** Headings are read slightly slower than body text, the way a narrator marks them. */
export const HEADING_RATE = 0.94

/** How many utterances may sit queued ahead of the one being spoken. */
const LOOKAHEAD = 3

const SENTENCE_END = /[.!?]["')\]”’]?$/

/** One utterance: a sentence, or the tail of one split across chunks. */
export interface SpeechUnit {
  text: string
  /** Index of this unit's first word among the chunk's display tokens. */
  tokenStart: number
  tokenCount: number
  /** False for a fragment that runs into the next unit, which must not be broken. */
  endsSentence: boolean
}

/** Splits a chunk into the sentences it will be spoken as. */
export function speechUnits(text: string): SpeechUnit[] {
  const units: SpeechUnit[] = []
  let tokenStart = 0
  for (const sentence of splitSentences(text)) {
    const tokenCount = sentence.split(/\s+/).filter(Boolean).length
    if (!tokenCount) continue
    units.push({ text: sentence, tokenStart, tokenCount, endsSentence: SENTENCE_END.test(sentence) })
    tokenStart += tokenCount
  }
  return units
}

/** The structural silence owed before `chunk`: paragraph and heading beats only. */
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

interface Position {
  chunk: number
  unit: number
}

const key = (position: Position): string => `${position.chunk}:${position.unit}`

/**
 * Drives continuous narration over a book's chunks.
 *
 * Speech is scheduled one sentence at a time. Where a sentence runs into the
 * next unit — a long sentence split across chunks — the continuation is handed
 * to the engine before the current one ends, so it plays straight through with
 * no seam. Everywhere else the silence is deliberate and timed.
 */
export class Narration {
  private handles = new Map<string, SpeechHandle>()
  private queued = new Set<string>()
  private timer: ReturnType<typeof setTimeout> | null = null
  private unitCache = new Map<number, SpeechUnit[]>()
  private speaking: string | null = null
  private start: Position = { chunk: 0, unit: 0 }
  private startWithinUnit = 0
  private paused = false
  private stopped = false
  /** Where to pick up from when a pause lands during a silence. */
  private pending: Position | null = null

  constructor(private readonly options: NarrationOptions) {}

  /**
   * Begins at chunk `from`, optionally partway through it: `fromToken` is a
   * display token index, so a reader can click a word and be read to from that
   * word rather than from the top of the chunk.
   */
  begin(from: number, fromToken = 0): void {
    this.stopped = false
    this.speaking = null
    this.pending = null
    this.queued.clear()

    const units = this.unitsFor(from)
    const token = Math.max(0, fromToken)
    const unit = units.findIndex((item) => token < item.tokenStart + item.tokenCount)
    this.start = { chunk: from, unit: unit === -1 ? Math.max(0, units.length - 1) : unit }
    this.startWithinUnit = unit === -1 ? 0 : Math.max(0, token - units[unit].tokenStart)

    this.speak(this.start, false, 0)
  }

  stop(): void {
    this.stopped = true
    this.clearTimer()
    for (const handle of this.handles.values()) handle.stop()
    this.handles.clear()
    this.queued.clear()
    this.speaking = null
    this.pending = null
  }

  pause(): void {
    this.paused = true
    for (const handle of this.handles.values()) handle.pause()
  }

  resume(): void {
    this.paused = false
    for (const handle of this.handles.values()) handle.resume()
    // A pause during a silence has nothing to resume, so the next utterance was
    // held back instead of being started and immediately paused.
    const pending = this.pending
    this.pending = null
    if (pending) this.speak(pending, false, 0)
  }

  private unitsFor(chunkIndex: number): SpeechUnit[] {
    const cached = this.unitCache.get(chunkIndex)
    if (cached) return cached
    const chunk = this.options.chunks[chunkIndex]
    const units = chunk ? speechUnits(chunk.text) : []
    this.unitCache.set(chunkIndex, units)
    return units
  }

  private next(position: Position): Position | null {
    if (position.unit + 1 < this.unitsFor(position.chunk).length) {
      return { chunk: position.chunk, unit: position.unit + 1 }
    }
    const chunk = position.chunk + 1
    return this.options.chunks[chunk] ? { chunk, unit: 0 } : null
  }

  /** Silence owed before `position`, given the unit that precedes it. */
  private pauseAt(position: Position, previous: Position): number {
    const { chunks } = this.options
    if (position.chunk !== previous.chunk) {
      const structural = pauseBefore(chunks[position.chunk], chunks[previous.chunk])
      if (structural > 0) return structural
    }
    const previousUnit = this.unitsFor(previous.chunk)[previous.unit]
    // A sentence split across chunks must not be broken mid-clause.
    return previousUnit?.endsSentence ? PAUSES.sentence : 0
  }

  private speak(position: Position, append: boolean, depth: number): void {
    const { chunks, provider, voiceId, rate, bookId, callbacks } = this.options
    const chunk = chunks[position.chunk]
    if (!chunk) {
      callbacks.onFinished()
      return
    }

    const unit = this.unitsFor(position.chunk)[position.unit]
    if (!unit) {
      const following = this.next(position)
      if (following) this.speak(following, append, depth)
      else callbacks.onFinished()
      return
    }

    const within = key(position) === key(this.start) ? this.startWithinUnit : 0
    const whole = toSpeech(unit.text)
    const speech = within > 0 ? toSpeech(whole.tokens.slice(within).join(' ')) : whole
    if (!speech.text) {
      // Nothing speakable here: a stray citation or a bullet glyph.
      const following = this.next(position)
      if (following) this.speak(following, append, depth)
      else callbacks.onFinished()
      return
    }

    const tokenOffset = unit.tokenStart + within
    const id = key(position)
    this.queued.add(id)

    const handle = provider.speak({
      text: speech.text,
      rate: rateFor(chunk, rate),
      voiceId,
      append,
      cacheKey: `${bookId}:${chunk.index}:${unit.tokenStart}`,
      onStart: () => {
        if (this.stopped) return
        this.speaking = id
        callbacks.onToken(tokenOffset)
        callbacks.onIndex(position.chunk)
      },
      onBoundary: (charIndex) => {
        if (this.stopped || this.speaking !== id) return
        const token = tokenAtOffset(speech, charIndex)
        callbacks.onToken(token < 0 ? tokenOffset : tokenOffset + token)
      },
      onEnd: (error) => {
        if (this.stopped) return
        this.handles.delete(id)
        this.queued.delete(id)
        if (error) {
          callbacks.onError(error.message)
          return
        }
        this.afterUnit(position)
      },
    })

    this.handles.set(id, handle)
    if (this.paused) handle.pause()

    this.queueContinuation(position, depth)
  }

  /** Queues what follows when it belongs to the same sentence as `from`. */
  private queueContinuation(from: Position, depth: number): void {
    if (!this.options.provider.supportsQueueing) return
    if (depth >= LOOKAHEAD) return
    const following = this.next(from)
    if (!following || this.queued.has(key(following))) return
    if (this.pauseAt(following, from) > 0) return
    this.speak(following, true, depth + 1)
  }

  private afterUnit(position: Position): void {
    const following = this.next(position)
    if (!following) {
      this.options.callbacks.onFinished()
      return
    }

    const gap = this.pauseAt(following, position)
    if (gap === 0 && this.queued.has(key(following))) {
      // Already playing straight on; just keep the queue topped up.
      this.queueContinuation(following, this.queued.size)
      return
    }

    this.clearTimer()
    this.timer = setTimeout(() => {
      this.timer = null
      if (this.stopped) return
      // Never start speaking while paused: on Chromium the new utterance would
      // ignore the pause and carry on by itself.
      if (this.paused) this.pending = following
      else this.speak(following, false, 0)
    }, gap)
  }

  private clearTimer(): void {
    if (this.timer !== null) {
      clearTimeout(this.timer)
      this.timer = null
    }
  }
}
