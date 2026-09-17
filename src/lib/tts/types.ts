export interface TtsVoice {
  id: string
  name: string
  lang: string
  /** True for voices the platform considers the default for their language. */
  default?: boolean
}

export interface SpeakOptions {
  text: string
  rate: number
  voiceId?: string | null
  /** Stable key for caching synthesized audio, e.g. `<bookId>:<chunkIndex>`. */
  cacheKey?: string
  /** Character offset into `text` of the word being spoken, when supported. */
  onBoundary?: (charIndex: number) => void
  onEnd: (error?: Error) => void
}

export interface SpeechHandle {
  stop: () => void
  pause: () => void
  resume: () => void
}

export interface TtsProvider {
  id: string
  name: string
  /** Whether the provider reports word boundaries, which drives text highlighting. */
  supportsBoundaries: boolean
  isAvailable: () => boolean
  listVoices: () => Promise<TtsVoice[]>
  speak: (options: SpeakOptions) => SpeechHandle
}
