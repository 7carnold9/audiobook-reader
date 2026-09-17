import { describe, expect, it } from 'vitest'
import { MAX_FAVOURITES, orderVoices, searchVoices, shortlist, toggleFavourite } from './favourites'
import type { TtsVoice } from './types'

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
  voice('d', 'Karen', 'en-AU'),
]

describe('toggleFavourite', () => {
  it('adds and removes', () => {
    expect(toggleFavourite([], 'b')).toEqual(['b'])
    expect(toggleFavourite(['b', 'c'], 'b')).toEqual(['c'])
  })

  it('refuses to grow past the limit', () => {
    const full = Array.from({ length: MAX_FAVOURITES }, (_, i) => `v${i}`)
    expect(toggleFavourite(full, 'another')).toEqual(full)
    // Removing still works when full.
    expect(toggleFavourite(full, 'v0')).toHaveLength(MAX_FAVOURITES - 1)
  })
})

describe('shortlist', () => {
  it('keeps the starred order and drops voices that disappeared', () => {
    expect(shortlist(VOICES, ['c', 'gone', 'b']).map((item) => item.name)).toEqual([
      'Samantha',
      'Daniel',
    ])
  })
})

describe('searchVoices', () => {
  it('matches on name or language', () => {
    expect(searchVoices(VOICES, 'dan').map((item) => item.id)).toEqual(['b'])
    expect(searchVoices(VOICES, 'en-').map((item) => item.id)).toEqual(['b', 'c', 'd'])
    expect(searchVoices(VOICES, '  ')).toHaveLength(4)
  })
})

describe('orderVoices', () => {
  it('lists favourites first, then local defaults, then the rest', () => {
    expect(orderVoices(VOICES, ['d'], 'en-US').map((item) => item.name)).toEqual([
      'Karen', // starred
      'Samantha', // default voice for the reader's language
      'Daniel', // same language
      'Amelie', // everything else
    ])
  })

  it('keeps the starred order', () => {
    expect(orderVoices(VOICES, ['a', 'c'], 'en-US').slice(0, 2).map((item) => item.id)).toEqual([
      'a',
      'c',
    ])
  })
})
