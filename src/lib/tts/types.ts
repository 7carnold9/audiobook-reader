export interface TtsVoice {
  id: string
  name: string
  lang: string
  /** True for voices the platform considers the default for their language. */
  default?: boolean
  /** False for voices synthesized over the network, which are usually the better ones. */
  localService?: boolean
}

export interface SpeakOptions {
  text: string
  rate: number
  voiceId?: string | null
  /** Stable key for caching synthesized audio, e.g. `<bookId>:<chunkIndex>`. */
  cacheKey?: string
  /**
   * Queue behind whatever is already speaking instead of interrupting it.
   * This is what lets a paragraph split across chunks play as one breath.
   */
  append?: boolean
  /** Fires when this request actually begins speaking, which may be after a queued wait. */
  onStart?: () => void
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
  /** Whether `append` is honoured, i.e. requests can be queued seamlessly. */
  supportsQueueing: boolean
  isAvailable: () => boolean
  listVoices: () => Promise<TtsVoice[]>
  speak: (options: SpeakOptions) => SpeechHandle
}
