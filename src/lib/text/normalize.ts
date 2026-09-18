/**
 * Prepares text for speech without losing the link back to what is on screen.
 *
 * Technical prose reads badly out loud as-is: inline citations, URLs, math
 * symbols and abbreviations all need rewriting. Doing that on a plain string
 * would break word highlighting, so normalization is done token by token and
 * every spoken word keeps a pointer back to the display token it came from.
 */
export interface SpokenWord {
  /** Character offset of this word within `SpeechText.text`. */
  offset: number
  /** Index into `SpeechText.tokens`. */
  token: number
}

export interface SpeechText {
  /** What gets sent to the TTS engine. */
  text: string
  /** Display tokens, in order, as shown in the transcript. */
  tokens: string[]
  words: SpokenWord[]
}

const ABBREVIATIONS: Record<string, string> = {
  'e.g.': 'for example',
  'i.e.': 'that is',
  'etc.': 'et cetera',
  'et': 'et',
  'al.': 'others',
  'vs.': 'versus',
  'vs': 'versus',
  'cf.': 'compare',
  'fig.': 'figure',
  'figs.': 'figures',
  'eq.': 'equation',
  'eqs.': 'equations',
  'ref.': 'reference',
  'refs.': 'references',
  'sec.': 'section',
  'ch.': 'chapter',
  'pp.': 'pages',
  'p.': 'page',
  'no.': 'number',
  'approx.': 'approximately',
  'ca.': 'circa',
  'est.': 'estimated',
  'incl.': 'including',
}

const SYMBOLS: Record<string, string> = {
  '=': 'equals',
  '+': 'plus',
  '±': 'plus or minus',
  '×': 'times',
  '÷': 'divided by',
  '<': 'less than',
  '>': 'greater than',
  '≤': 'less than or equal to',
  '≥': 'greater than or equal to',
  '≈': 'approximately',
  '≠': 'not equal to',
  '→': 'to',
  '∞': 'infinity',
  '∑': 'the sum of',
  '√': 'the square root of',
  '∂': 'partial',
  '%': 'percent',
  '°': 'degrees',
  'α': 'alpha',
  'β': 'beta',
  'γ': 'gamma',
  'δ': 'delta',
  'ε': 'epsilon',
  'θ': 'theta',
  'λ': 'lambda',
  'μ': 'mu',
  'π': 'pi',
  'σ': 'sigma',
  'φ': 'phi',
  'ω': 'omega',
  'Δ': 'delta',
  'Σ': 'sigma',
  'Ω': 'omega',
  '&': 'and',
  '@': 'at',
  '§': 'section',
  '©': 'copyright',
}

const BULLETS = /^[•·▪◦‣*■●–—|]+$/

/** Converts a display string into speech text plus a word-level alignment map. */
export function toSpeech(display: string): SpeechText {
  const tokens = display.split(/\s+/).filter(Boolean)
  const words: SpokenWord[] = []
  let text = ''

  tokens.forEach((token, index) => {
    for (const spoken of speakToken(token)) {
      // Punctuation left behind by a removed citation belongs to the word
      // before it, not to a word of its own.
      if (text && /^[.,;:!?)\]]+$/.test(spoken)) {
        text += spoken
        continue
      }
      if (text) text += ' '
      words.push({ offset: text.length, token: index })
      text += spoken
    }
  })

  return { text, tokens, words }
}

/** Expands one display token into zero or more spoken words. */
export function speakToken(token: string): string[] {
  let word = token
    // Inline numeric citations: "model[12]", "[3-5]", "result[1],".
    .replace(/\[\s*\d+(\s*[–—,-]\s*\d+)*\s*\]/g, '')
    // Superscript footnote markers.
    .replace(/[¹²³⁰⁴-⁹]/g, '')
    .trim()

  if (!word || BULLETS.test(word)) return []

  if (/^(https?:\/\/|www\.)\S+$/i.test(word)) return ['a link']
  if (/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i.test(word)) return ['an email address']

  // Em/en dashes read as pauses rather than words.
  word = word.replace(/\s*[—–]\s*/g, ', ')

  const lower = word.toLowerCase().replace(/^[("'“‘]+/, '')
  const abbreviation = ABBREVIATIONS[lower] ?? ABBREVIATIONS[lower.replace(/[,;:)]+$/, '')]
  if (abbreviation !== undefined) return abbreviation.split(' ')

  // Replace standalone or embedded math/symbol characters with their names.
  const expanded = word.replace(/[=+±×÷<>≤≥≈≠→∞∑√∂%°αβγδεθλμπσφωΔΣΩ&@§©]/g, (symbol) =>
    ` ${SYMBOLS[symbol]} `,
  )

  const pieces: string[] = []
  for (const piece of expanded.split(/\s+/)) {
    const trimmed = piece.trim()
    if (!trimmed || BULLETS.test(trimmed)) continue
    // Expanding a symbol can strand the punctuation that followed it
    // ("2.1%." -> "2.1 percent ."); glue it back onto the previous word.
    if (/^[.,;:!?)\]]+$/.test(trimmed) && pieces.length) {
      pieces[pieces.length - 1] += trimmed
    } else {
      pieces.push(trimmed)
    }
  }
  return pieces
}

/** Rough spoken length, used to build the scrub timeline before any audio exists. */
export function estimateSeconds(wordCount: number, rate = 1): number {
  const wordsPerMinute = 165 * rate
  return (wordCount / wordsPerMinute) * 60
}

/** Maps a character offset inside speech text back to a display token index. */
export function tokenAtOffset(speech: SpeechText, charIndex: number): number {
  let low = 0
  let high = speech.words.length - 1
  let best = -1
  while (low <= high) {
    const mid = (low + high) >> 1
    if (speech.words[mid].offset <= charIndex) {
      best = mid
      low = mid + 1
    } else {
      high = mid - 1
    }
  }
  return best >= 0 ? speech.words[best].token : -1
}

/**
 * Maps a character offset in a display string to the index of the word token
 * containing it — the bridge between "the reader clicked here" and the token
 * indices the player speaks from.
 */
export function tokenIndexAtCharOffset(text: string, charOffset: number): number {
  if (charOffset <= 0) return 0
  let index = -1
  let insideToken = false
  const limit = Math.min(charOffset, text.length - 1)
  for (let i = 0; i <= limit; i++) {
    const space = /\s/.test(text[i])
    if (space) {
      insideToken = false
    } else if (!insideToken) {
      index++
      insideToken = true
    }
  }
  return Math.max(0, index)
}
