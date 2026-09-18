import { describe, expect, it } from 'vitest'
import { pickPreferredVoice, resolveVoice } from './bookVoice'
import type { TtsVoice } from '../lib/tts'

const voice = (id: string, name: string, lang: string, isDefault = false): TtsVoice => ({
  id,
  name,
  lang,
  ...(isDefault ? { default: true } : {}),
})

const VOICES = [
  voice('a', 'Amelie', 'fr-FR'),
  voice('b', 'Daniel', 'en-GB'),
  voice('c', 'Samantha', 'en-US', true),
]

describe('resolveVoice', () => {
  it('reads a book in its own voice', () => {
    expect(
      resolveVoice({ bookVoiceId: 'b', defaultVoiceId: 'c', voices: VOICES, language: 'en-US' }),
    ).toEqual({ voiceId: 'b', source: 'book' })
  })

  it('falls back to the default for a book with no voice of its own', () => {
    expect(
      resolveVoice({ bookVoiceId: null, defaultVoiceId: 'a', voices: VOICES, language: 'en-US' }),
    ).toEqual({ voiceId: 'a', source: 'default' })
  })

  it('falls back to the default when the book voice is gone', () => {
    // The user switched engines, or removed a system voice: narrating with an id
    // this engine does not know would play nothing at all.
    expect(
      resolveVoice({ bookVoiceId: 'gone', defaultVoiceId: 'b', voices: VOICES, language: 'en-US' }),
    ).toEqual({ voiceId: 'b', source: 'default' })
  })

  it('picks a voice itself when neither the book nor the default survives', () => {
    expect(
      resolveVoice({ bookVoiceId: 'gone', defaultVoiceId: 'also-gone', voices: VOICES, language: 'en-GB' }),
    ).toEqual({ voiceId: 'c', source: 'auto' })
  })

  it('picks a voice itself on a first run, with nothing saved anywhere', () => {
    expect(
      resolveVoice({ bookVoiceId: null, defaultVoiceId: null, voices: VOICES, language: 'fr-CA' }),
    ).toEqual({ voiceId: 'a', source: 'auto' })
  })

  it('keeps the saved ids while the engine has not listed its voices yet', () => {
    expect(
      resolveVoice({ bookVoiceId: 'b', defaultVoiceId: 'c', voices: [], language: 'en-US' }),
    ).toEqual({ voiceId: 'b', source: 'book' })
    expect(
      resolveVoice({ bookVoiceId: null, defaultVoiceId: 'c', voices: [], language: 'en-US' }),
    ).toEqual({ voiceId: 'c', source: 'default' })
  })

  it('reports nothing when the engine offers nothing and nothing was saved', () => {
    expect(
      resolveVoice({ bookVoiceId: null, defaultVoiceId: null, voices: [], language: 'en-US' }),
    ).toEqual({ voiceId: null, source: 'default' })
  })
})

describe('pickPreferredVoice', () => {
  it('prefers a platform default in the reader’s language, then any voice in it', () => {
    expect(pickPreferredVoice(VOICES, 'en-AU')?.id).toBe('c')
    expect(pickPreferredVoice([VOICES[0], VOICES[1]], 'en-AU')?.id).toBe('b')
  })

  it('settles for the first voice when the language is not spoken at all', () => {
    expect(pickPreferredVoice(VOICES, 'ja-JP')?.id).toBe('a')
    expect(pickPreferredVoice([], 'en-US')).toBeUndefined()
  })
})
