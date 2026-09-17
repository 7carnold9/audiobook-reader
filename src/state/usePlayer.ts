import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { estimateSeconds, toSpeech, tokenAtOffset } from '../lib/text/normalize'
import type { SpeechHandle, TtsProvider } from '../lib/tts'
import type { Chunk } from '../lib/pdf/types'

export type PlayerStatus = 'idle' | 'playing' | 'paused' | 'ended'

export interface PlayerOptions {
  bookId: string
  chunks: Chunk[]
  provider: TtsProvider
  voiceId: string | null
  initialIndex?: number
  initialRate?: number
  onIndexChange?: (index: number) => void
}

export interface Player {
  status: PlayerStatus
  index: number
  /** Display-token index within the current chunk, or -1 when unknown. */
  tokenIndex: number
  rate: number
  error: string | null
  /** Estimated seconds played and total, adjusted for the current rate. */
  elapsed: number
  duration: number
  play: () => void
  pause: () => void
  /** Ends the utterance outright, keeping the position. */
  stop: () => void
  toggle: () => void
  seekToChunk: (index: number) => void
  skip: (delta: number) => void
  seekToSeconds: (seconds: number) => void
  setRate: (rate: number) => void
}

/**
 * Drives sequential playback over the book's chunks.
 *
 * Playback is engaged/disengaged separately from pausing so that pausing can
 * use the provider's own pause instead of tearing down the utterance, which
 * would lose the position inside the current chunk.
 */
export function usePlayer({
  bookId,
  chunks,
  provider,
  voiceId,
  initialIndex = 0,
  initialRate = 1,
  onIndexChange,
}: PlayerOptions): Player {
  const [engaged, setEngaged] = useState(false)
  const [paused, setPaused] = useState(false)
  const [index, setIndex] = useState(initialIndex)
  const [tokenIndex, setTokenIndex] = useState(-1)
  const [rate, setRateState] = useState(initialRate)
  const [error, setError] = useState<string | null>(null)

  const handleRef = useRef<SpeechHandle | null>(null)
  const pausedRef = useRef(paused)
  pausedRef.current = paused

  const timeline = useMemo(() => buildTimeline(chunks), [chunks])

  useEffect(() => {
    onIndexChange?.(index)
  }, [index, onIndexChange])

  useEffect(() => {
    if (!engaged) return
    const chunk = chunks[index]
    if (!chunk) {
      setEngaged(false)
      return
    }

    const speech = toSpeech(chunk.text)
    if (!speech.text) {
      setIndex((current) => current + 1)
      return
    }

    let cancelled = false
    setTokenIndex(-1)
    setError(null)

    const handle = provider.speak({
      text: speech.text,
      rate,
      voiceId,
      cacheKey: `${bookId}:${chunk.index}`,
      onBoundary: (charIndex) => {
        if (!cancelled) setTokenIndex(tokenAtOffset(speech, charIndex))
      },
      onEnd: (speakError) => {
        if (cancelled) return
        if (speakError) {
          setError(speakError.message)
          setPaused(true)
          return
        }
        setIndex((current) => current + 1)
      },
    })
    handleRef.current = handle
    // A rate or voice change while paused restarts the chunk; keep it paused.
    if (pausedRef.current) handle.pause()

    return () => {
      cancelled = true
      handle.stop()
      if (handleRef.current === handle) handleRef.current = null
    }
  }, [engaged, index, rate, voiceId, provider, chunks, bookId])

  // Stop speaking if the component unmounts mid-sentence.
  useEffect(() => () => handleRef.current?.stop(), [])

  const play = useCallback(() => {
    setError(null)
    setPaused(false)
    if (handleRef.current && pausedRef.current) handleRef.current.resume()
    setEngaged(true)
  }, [])

  const pause = useCallback(() => {
    setPaused(true)
    handleRef.current?.pause()
  }, [])

  const stop = useCallback(() => {
    setPaused(false)
    setEngaged(false)
  }, [])

  const toggle = useCallback(() => {
    if (engaged && !paused) pause()
    else play()
  }, [engaged, paused, pause, play])

  const seekToChunk = useCallback(
    (next: number) => {
      const clamped = Math.max(0, Math.min(chunks.length - 1, next))
      setTokenIndex(-1)
      setIndex(clamped)
    },
    [chunks.length],
  )

  const skip = useCallback((delta: number) => setIndexClamped(setIndex, delta, chunks.length), [chunks.length])

  const seekToSeconds = useCallback(
    (seconds: number) => seekToChunk(chunkAtSeconds(timeline, seconds * rate)),
    [seekToChunk, timeline, rate],
  )

  const setRate = useCallback((next: number) => setRateState(Math.min(3, Math.max(0.5, next))), [])

  const status: PlayerStatus = !engaged
    ? index >= chunks.length && chunks.length > 0
      ? 'ended'
      : 'idle'
    : paused
      ? 'paused'
      : 'playing'

  const currentTokens = chunks[index] ? toSpeech(chunks[index].text).tokens.length : 0
  const withinChunk = currentTokens > 0 && tokenIndex >= 0 ? tokenIndex / currentTokens : 0
  const baseElapsed =
    (timeline.starts[Math.min(index, chunks.length - 1)] ?? timeline.total) +
    withinChunk * (timeline.durations[index] ?? 0)

  return {
    status,
    index,
    tokenIndex,
    rate,
    error,
    elapsed: baseElapsed / rate,
    duration: timeline.total / rate,
    play,
    pause,
    stop,
    toggle,
    seekToChunk,
    skip,
    seekToSeconds,
    setRate,
  }
}

function setIndexClamped(
  setIndex: (updater: (current: number) => number) => void,
  delta: number,
  length: number,
): void {
  setIndex((current) => Math.max(0, Math.min(length - 1, current + delta)))
}

export interface Timeline {
  /** Estimated start time of each chunk at rate 1, in seconds. */
  starts: number[]
  durations: number[]
  total: number
}

export function buildTimeline(chunks: Chunk[]): Timeline {
  const starts: number[] = []
  const durations: number[] = []
  let total = 0
  for (const chunk of chunks) {
    const words = chunk.text.split(/\s+/).filter(Boolean).length
    const duration = estimateSeconds(words)
    starts.push(total)
    durations.push(duration)
    total += duration
  }
  return { starts, durations, total }
}

export function chunkAtSeconds(timeline: Timeline, seconds: number): number {
  let low = 0
  let high = timeline.starts.length - 1
  let best = 0
  while (low <= high) {
    const mid = (low + high) >> 1
    if (timeline.starts[mid] <= seconds) {
      best = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return best
}
