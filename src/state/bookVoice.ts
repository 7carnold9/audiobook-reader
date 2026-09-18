import type { TtsVoice } from '../lib/tts'

/**
 * Where the voice now playing came from:
 * - `book`    the book's own voice,
 * - `default` the default for books that have none,
 * - `auto`    neither was usable, so one was picked from what the engine offers.
 */
export type VoiceSource = 'book' | 'default' | 'auto'

export interface VoiceResolution {
  voiceId: string | null
  source: VoiceSource
}

export interface VoiceResolutionInput {
  /** The voice saved for this book, or null when it has none of its own. */
  bookVoiceId: string | null
  /** The voice used by books with no voice of their own. */
  defaultVoiceId: string | null
  /** Exactly what the engine in use offers right now. */
  voices: TtsVoice[]
  /** The reader's own language, used only when nothing else survives. */
  language: string
}

/**
 * Decides which voice a book is narrated in. A saved id is only honoured while
 * the engine still offers it: switching engines, or losing a system voice,
 * otherwise leaves the reader mute with an id nothing can speak.
 */
export function resolveVoice({
  bookVoiceId,
  defaultVoiceId,
  voices,
  language,
}: VoiceResolutionInput): VoiceResolution {
  // An empty list means the engine has not answered yet, not that every voice
  // is gone — discarding the saved ids here would overwrite them on every open.
  if (voices.length === 0) {
    return bookVoiceId
      ? { voiceId: bookVoiceId, source: 'book' }
      : { voiceId: defaultVoiceId, source: 'default' }
  }
  if (bookVoiceId && offers(voices, bookVoiceId)) return { voiceId: bookVoiceId, source: 'book' }
  if (defaultVoiceId && offers(voices, defaultVoiceId)) {
    return { voiceId: defaultVoiceId, source: 'default' }
  }
  return { voiceId: pickPreferredVoice(voices, language)?.id ?? null, source: 'auto' }
}

/** The best first guess from a fresh engine: a platform default in the reader's language. */
export function pickPreferredVoice(voices: TtsVoice[], language: string): TtsVoice | undefined {
  const prefix = language.slice(0, 2).toLowerCase()
  const local = (voice: TtsVoice) => voice.lang.toLowerCase().startsWith(prefix)
  return voices.find((voice) => voice.default && local(voice)) ?? voices.find(local) ?? voices[0]
}

function offers(voices: TtsVoice[], id: string): boolean {
  return voices.some((voice) => voice.id === id)
}
