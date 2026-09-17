import type { TtsVoice } from './types'

/**
 * How many voices can sit on the shortlist. The point of the shortlist is to
 * replace a hundred-entry dropdown with a row of buttons, so it stays small
 * enough to fit in the player bar.
 */
export const MAX_FAVOURITES = 6

/** Adds or removes a voice, ignoring additions once the shortlist is full. */
export function toggleFavourite(favourites: string[], id: string): string[] {
  if (favourites.includes(id)) return favourites.filter((item) => item !== id)
  if (favourites.length >= MAX_FAVOURITES) return favourites
  return [...favourites, id]
}

/** The shortlisted voices, in the order they were starred, skipping any that the provider no longer offers. */
export function shortlist(voices: TtsVoice[], favourites: string[]): TtsVoice[] {
  return favourites
    .map((id) => voices.find((voice) => voice.id === id))
    .filter((voice): voice is TtsVoice => voice !== undefined)
}

/** Matches the query against both the voice name and its language tag. */
export function searchVoices(voices: TtsVoice[], query: string): TtsVoice[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return voices
  return voices.filter(
    (voice) =>
      voice.name.toLowerCase().includes(needle) || voice.lang.toLowerCase().includes(needle),
  )
}

/**
 * Puts the voices worth trying first: shortlisted ones, then the platform
 * defaults for the reader's own language, then everything else grouped by
 * language.
 */
export function orderVoices(
  voices: TtsVoice[],
  favourites: string[],
  language: string,
): TtsVoice[] {
  const prefix = language.slice(0, 2).toLowerCase()
  const rank = (voice: TtsVoice): number => {
    const starred = favourites.indexOf(voice.id)
    if (starred >= 0) return starred
    const local = voice.lang.toLowerCase().startsWith(prefix)
    if (local && voice.default) return MAX_FAVOURITES + 1
    if (local) return MAX_FAVOURITES + 2
    return MAX_FAVOURITES + 3
  }
  return [...voices].sort(
    (a, b) => rank(a) - rank(b) || a.lang.localeCompare(b.lang) || a.name.localeCompare(b.name),
  )
}
