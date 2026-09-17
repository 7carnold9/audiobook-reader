import { STORES, idb } from '../storage/db'
import type { AudioRecord } from '../storage/db'
import type { SpeakOptions, SpeechHandle, TtsProvider, TtsVoice } from './types'

export interface HttpTtsConfig {
  /** Endpoint that takes `{ text, voiceId }` and returns audio bytes. */
  endpoint: string
  name?: string
  voices?: TtsVoice[]
  headers?: Record<string, string>
}

/**
 * Cloud TTS over a small backend endpoint (ElevenLabs, OpenAI, Google, Azure —
 * the provider key stays server-side, never in the bundle).
 *
 * A full book is a lot of characters, so every chunk is cached in IndexedDB on
 * first synthesis and replayed from there afterwards. Playback speed is applied
 * with `playbackRate`, which keeps the cache independent of the chosen speed.
 */
export function createHttpTtsProvider(config: HttpTtsConfig): TtsProvider {
  return {
    id: 'http',
    name: config.name ?? 'Cloud voice',
    // Most cloud APIs return plain audio with no timing data, so highlighting
    // falls back to the chunk level.
    supportsBoundaries: false,

    isAvailable: () => Boolean(config.endpoint),

    listVoices: async () => config.voices ?? [],

    speak({ text, rate, voiceId, cacheKey, onEnd }: SpeakOptions): SpeechHandle {
      const audio = new Audio()
      audio.preload = 'auto'
      let stopped = false
      let objectUrl: string | null = null

      const cleanup = () => {
        audio.pause()
        audio.removeAttribute('src')
        if (objectUrl) URL.revokeObjectURL(objectUrl)
        objectUrl = null
      }

      const finish = (error?: Error) => {
        if (stopped) return
        stopped = true
        cleanup()
        onEnd(error)
      }

      void (async () => {
        try {
          const blob = await synthesize(config, text, voiceId ?? null, cacheKey)
          if (stopped) return
          objectUrl = URL.createObjectURL(blob)
          audio.src = objectUrl
          audio.playbackRate = rate
          audio.onended = () => finish()
          audio.onerror = () => finish(new Error('Could not play the synthesized audio'))
          await audio.play()
        } catch (error) {
          finish(error instanceof Error ? error : new Error(String(error)))
        }
      })()

      return {
        stop: () => {
          stopped = true
          cleanup()
        },
        pause: () => audio.pause(),
        resume: () => void audio.play().catch(() => finish(new Error('Playback was blocked'))),
      }
    },
  }
}

async function synthesize(
  config: HttpTtsConfig,
  text: string,
  voiceId: string | null,
  cacheKey?: string,
): Promise<Blob> {
  const key = cacheKey ? `${cacheKey}:${voiceId ?? 'default'}` : null
  if (key) {
    const cached = await idb.get<AudioRecord>(STORES.audio, key).catch(() => undefined)
    if (cached) return cached.blob
  }

  const response = await fetch(config.endpoint, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', ...config.headers },
    body: JSON.stringify({ text, voiceId }),
  })
  if (!response.ok) {
    throw new Error(`Text-to-speech request failed (${response.status})`)
  }
  const blob = await response.blob()

  if (key) {
    await idb
      .put<AudioRecord>(STORES.audio, { key, blob, createdAt: Date.now() })
      .catch(() => undefined) // A full quota should not stop playback.
  }
  return blob
}
