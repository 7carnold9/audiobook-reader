import type { SpeakOptions, SpeechHandle, TtsProvider, TtsVoice } from './types'

/**
 * Browser-native speech synthesis. Free, offline on most platforms and the
 * fastest way to validate the whole pipeline — the voices are robotic, which is
 * what the cloud providers behind `httpTts` are for.
 */
export const webSpeechProvider: TtsProvider = {
  id: 'web-speech',
  name: 'System voice (free)',
  supportsBoundaries: true,

  isAvailable: () => typeof window !== 'undefined' && 'speechSynthesis' in window,

  async listVoices(): Promise<TtsVoice[]> {
    if (!webSpeechProvider.isAvailable()) return []
    const voices = await loadVoices()
    return voices.map((voice) => ({
      id: voice.voiceURI,
      name: voice.name,
      lang: voice.lang,
      default: voice.default,
    }))
  },

  speak({ text, rate, voiceId, onBoundary, onEnd }: SpeakOptions): SpeechHandle {
    const synthesis = window.speechSynthesis
    // A pending utterance from a previous chunk would otherwise queue up behind us.
    synthesis.cancel()

    const utterance = new SpeechSynthesisUtterance(text)
    utterance.rate = clampRate(rate)
    const voice = voiceId ? synthesis.getVoices().find((item) => item.voiceURI === voiceId) : null
    if (voice) {
      utterance.voice = voice
      utterance.lang = voice.lang
    }

    let finished = false
    const finish = (error?: Error) => {
      if (finished) return
      finished = true
      clearInterval(keepAlive)
      onEnd(error)
    }

    utterance.onboundary = (event) => {
      if (event.name === 'word' || event.name === undefined) onBoundary?.(event.charIndex)
    }
    utterance.onend = () => finish()
    utterance.onerror = (event) => {
      // Cancelling is how we stop playback, so it is not an error condition.
      if (event.error === 'canceled' || event.error === 'interrupted') {
        finished = true
        clearInterval(keepAlive)
        return
      }
      finish(new Error(describeError(event.error)))
    }

    // Chromium stops speaking after ~15s unless it is nudged.
    const keepAlive = setInterval(() => {
      if (synthesis.speaking && !synthesis.paused) {
        synthesis.pause()
        synthesis.resume()
      }
    }, 10_000)

    synthesis.speak(utterance)

    return {
      stop: () => {
        finished = true
        clearInterval(keepAlive)
        synthesis.cancel()
      },
      pause: () => synthesis.pause(),
      resume: () => synthesis.resume(),
    }
  },
}

const ERROR_MESSAGES: Record<string, string> = {
  'synthesis-failed':
    'The browser could not start its speech engine. If no system voices are installed, ' +
    'narration will not work here — try Chrome, Edge or Safari, or configure a cloud voice.',
  'synthesis-unavailable': 'No speech engine is available in this browser.',
  'voice-unavailable': 'That voice is no longer available. Pick another one.',
  'language-unavailable': 'No installed voice can read this language.',
  'audio-busy': 'Something else is using the audio output. Try again in a moment.',
  'audio-hardware': 'No audio output device is available.',
  'not-allowed': 'The browser blocked audio. Interact with the page, then press play again.',
  network: 'This voice needs a network connection to speak.',
}

function describeError(error: string): string {
  return ERROR_MESSAGES[error] ?? `Speech synthesis failed (${error}).`
}

function clampRate(rate: number): number {
  return Math.min(4, Math.max(0.5, rate))
}

/** Voices load asynchronously in most browsers and can start out empty. */
function loadVoices(): Promise<SpeechSynthesisVoice[]> {
  const synthesis = window.speechSynthesis
  const existing = synthesis.getVoices()
  if (existing.length) return Promise.resolve(existing)
  return new Promise((resolve) => {
    const timeout = setTimeout(() => resolve(synthesis.getVoices()), 2000)
    synthesis.addEventListener(
      'voiceschanged',
      () => {
        clearTimeout(timeout)
        resolve(synthesis.getVoices())
      },
      { once: true },
    )
  })
}
