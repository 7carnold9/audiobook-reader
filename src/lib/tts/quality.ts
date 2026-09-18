import type { TtsVoice } from './types'

/**
 * How good a voice is likely to sound, inferred from what the platform tells us.
 *
 * Nothing in the Web Speech API reports quality, so this reads the naming
 * conventions the platforms actually use: Apple suffixes its better voices
 * "(Enhanced)" or "(Premium)", Microsoft marks its neural ones "Natural" or
 * "Online", Google's are network voices, and network voices are not local
 * services.
 *
 * Only three tiers, because that is as much as the names can honestly tell you:
 * a joke voice, the old robotic default, and one of the good ones.
 */
export type VoiceTier = 'novelty' | 'legacy' | 'good'

/** Apple ships these as jokes. None of them can read a book. */
const NOVELTY = new Set([
  'albert', 'bad news', 'bahh', 'bells', 'boing', 'bubbles', 'cellos', 'deranged',
  'good news', 'hysterical', 'jester', 'junior', 'organ', 'pipe organ', 'princess',
  'ralph', 'superstar', 'trinoids', 'whisper', 'wobble', 'zarvox',
])

const GOOD_NAME = /\b(enhanced|premium|natural|neural|online|siri|google|microsoft)\b/i

export function voiceTier(voice: TtsVoice): VoiceTier {
  if (NOVELTY.has(baseName(voice.name).toLowerCase())) return 'novelty'
  // A voice synthesized over the network is one of the good ones.
  if (voice.localService === false) return 'good'
  return GOOD_NAME.test(voice.name) ? 'good' : 'legacy'
}

/** "Samantha (Enhanced)" and "Samantha" are the same voice at two qualities. */
export function baseName(name: string): string {
  return name
    .replace(/\s*\((enhanced|premium|compact)\)\s*/gi, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

const RANK: Record<VoiceTier, number> = { novelty: 0, legacy: 1, good: 2 }

/**
 * Drops the voices not worth listening to a book in: the novelty voices always,
 * and the low-quality ones only where something better is installed for the same
 * language. Somebody with nothing but stock voices keeps them — an empty list
 * would be worse than a mediocre one.
 */
export function usableVoices(voices: TtsVoice[]): TtsVoice[] {
  const withoutJokes = voices.filter((voice) => voiceTier(voice) !== 'novelty')

  // A language with a better voice installed has no use for its legacy ones.
  const bestPerLanguage = new Map<string, number>()
  for (const voice of withoutJokes) {
    const language = voice.lang.slice(0, 2).toLowerCase()
    bestPerLanguage.set(language, Math.max(bestPerLanguage.get(language) ?? 0, RANK[voiceTier(voice)]))
  }

  const kept = withoutJokes.filter((voice) => {
    const language = voice.lang.slice(0, 2).toLowerCase()
    const best = bestPerLanguage.get(language) ?? 0
    return RANK[voiceTier(voice)] >= best
  })

  // Where the same voice appears at two qualities, keep the better one.
  const byName = new Map<string, TtsVoice>()
  for (const voice of kept) {
    const key = `${baseName(voice.name).toLowerCase()}|${voice.lang.toLowerCase()}`
    const existing = byName.get(key)
    if (!existing || RANK[voiceTier(voice)] > RANK[voiceTier(existing)]) byName.set(key, voice)
  }

  const survivors = new Set(byName.values())
  return kept.filter((voice) => survivors.has(voice))
}

/** How many voices the picker offers before you ask to see everything. */
export const BEST_VOICE_COUNT = 10

/**
 * The handful worth choosing between.
 *
 * A browser can expose well over a hundred voices, nearly all of them in
 * languages you do not read or at qualities you would not listen to. This
 * ranks what survives `usableVoices` by quality and by how well it matches the
 * reader's own language, and keeps the top few.
 */
export function bestVoices(
  voices: TtsVoice[],
  language: string,
  limit = BEST_VOICE_COUNT,
): TtsVoice[] {
  const prefix = language.slice(0, 2).toLowerCase()
  const exact = language.toLowerCase()

  const score = (voice: TtsVoice): number => {
    const lang = voice.lang.toLowerCase().replace('_', '-')
    const languageScore = lang === exact ? 3 : lang.startsWith(prefix) ? 2 : 0
    return languageScore * 10 + RANK[voiceTier(voice)] * 2 + (voice.default ? 1 : 0)
  }

  return [...usableVoices(voices)]
    .sort((a, b) => score(b) - score(a) || a.name.localeCompare(b.name))
    .slice(0, limit)
}
