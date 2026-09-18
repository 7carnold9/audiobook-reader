import { describe, expect, it } from 'vitest'
import { baseName, bestVoices, usableVoices, voiceTier } from './quality'
import type { TtsVoice } from './types'

const voice = (name: string, lang = 'en-US', extra: Partial<TtsVoice> = {}): TtsVoice => ({
  id: `${name}|${lang}`,
  name,
  lang,
  ...extra,
})

describe('voiceTier', () => {
  it('spots the joke voices Apple ships', () => {
    expect(voiceTier(voice('Zarvox'))).toBe('novelty')
    expect(voiceTier(voice('Bad News'))).toBe('novelty')
  })

  it('reads the platforms own quality labels', () => {
    expect(voiceTier(voice('Samantha (Enhanced)'))).toBe('good')
    expect(voiceTier(voice('Microsoft Aria Online (Natural)'))).toBe('good')
    expect(voiceTier(voice('Google UK English Female'))).toBe('good')
    expect(voiceTier(voice('Karen'))).toBe('legacy')
  })

  it('treats a voice synthesized over the network as a good one', () => {
    expect(voiceTier(voice('Some Cloud Voice', 'en-US', { localService: false }))).toBe('good')
  })
})

describe('baseName', () => {
  it('strips the quality suffix so the same voice can be recognised', () => {
    expect(baseName('Samantha (Enhanced)')).toBe('Samantha')
    expect(baseName('Daniel (Premium)')).toBe('Daniel')
    expect(baseName('Karen')).toBe('Karen')
  })
})

describe('usableVoices', () => {
  it('always drops the novelty voices', () => {
    const kept = usableVoices([voice('Samantha'), voice('Zarvox'), voice('Bubbles')])
    expect(kept.map((item) => item.name)).toEqual(['Samantha'])
  })

  it('drops the legacy voices once a better one is installed for that language', () => {
    const kept = usableVoices([
      voice('Samantha'),
      voice('Karen', 'en-AU'),
      voice('Daniel (Enhanced)', 'en-GB'),
    ])
    expect(kept.map((item) => item.name)).toEqual(['Daniel (Enhanced)'])
  })

  it('keeps stock voices when there is nothing better, rather than emptying the list', () => {
    const stock = [voice('Samantha'), voice('Karen', 'en-AU'), voice('Daniel', 'en-GB')]
    expect(usableVoices(stock)).toHaveLength(3)
  })

  it('does not strand a language that has only legacy voices', () => {
    const kept = usableVoices([voice('Samantha (Enhanced)'), voice('Amélie', 'fr-FR')])
    expect(kept.map((item) => item.name)).toContain('Amélie')
  })

  it('keeps the better copy when the same voice appears twice', () => {
    const kept = usableVoices([voice('Samantha'), voice('Samantha (Enhanced)')])
    expect(kept.map((item) => item.name)).toEqual(['Samantha (Enhanced)'])
  })
})

describe('bestVoices', () => {
  const many = [
    voice('Samantha (Enhanced)', 'en-US'),
    voice('Ava (Premium)', 'en-US'),
    voice('Daniel (Enhanced)', 'en-GB'),
    voice('Google US English', 'en-US'),
    voice('Amélie (Enhanced)', 'fr-FR'),
    voice('Anna (Enhanced)', 'de-DE'),
    voice('Kyoko (Enhanced)', 'ja-JP'),
    voice('Zarvox', 'en-US'),
  ]

  it('puts the reader own language first', () => {
    const best = bestVoices(many, 'en-US', 3)
    expect(best.every((item) => item.lang.startsWith('en'))).toBe(true)
  })

  it('caps the list', () => {
    expect(bestVoices(many, 'en-US', 3)).toHaveLength(3)
    expect(bestVoices(many, 'en-US')).toHaveLength(7) // everything but the joke voice
  })

  it('still offers other languages once the good ones are in', () => {
    expect(bestVoices(many, 'en-US').map((item) => item.lang)).toContain('fr-FR')
  })

  it('never returns a novelty voice', () => {
    expect(bestVoices(many, 'en-US').map((item) => item.name)).not.toContain('Zarvox')
  })
})
