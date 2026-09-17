import { createHttpTtsProvider } from './http'
import type { HttpTtsConfig } from './http'
import { webSpeechProvider } from './webSpeech'
import type { TtsProvider } from './types'

export type { TtsProvider, TtsVoice, SpeakOptions, SpeechHandle } from './types'
export { webSpeechProvider, createHttpTtsProvider }
export { MAX_FAVOURITES, orderVoices, searchVoices, shortlist, toggleFavourite } from './favourites'

/**
 * Providers available to the player. The browser voice is always present; a
 * cloud voice appears when `VITE_TTS_ENDPOINT` points at a backend that
 * accepts `{ text, voiceId }` and returns audio.
 */
export function availableProviders(): TtsProvider[] {
  const providers: TtsProvider[] = [webSpeechProvider]
  const endpoint = import.meta.env.VITE_TTS_ENDPOINT as string | undefined
  if (endpoint) {
    const config: HttpTtsConfig = {
      endpoint,
      name: (import.meta.env.VITE_TTS_NAME as string | undefined) ?? 'Cloud voice',
      voices: parseVoices(import.meta.env.VITE_TTS_VOICES as string | undefined),
    }
    providers.push(createHttpTtsProvider(config))
  }
  return providers.filter((provider) => provider.isAvailable())
}

/** `VITE_TTS_VOICES` is a comma-separated `id:Label` list, e.g. `alloy:Alloy,nova:Nova`. */
function parseVoices(raw: string | undefined) {
  if (!raw) return []
  return raw
    .split(',')
    .map((entry) => entry.trim())
    .filter(Boolean)
    .map((entry) => {
      const [id, ...rest] = entry.split(':')
      return { id, name: rest.join(':') || id, lang: 'en-US' }
    })
}
