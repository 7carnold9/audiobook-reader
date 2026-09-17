import { describe, expect, it } from 'vitest'
import { speakToken, toSpeech, tokenAtOffset } from './normalize'

describe('speakToken', () => {
  it('drops inline citations and footnote markers', () => {
    expect(speakToken('encoders[3-5],')).toEqual(['encoders,'])
    expect(speakToken('[12]')).toEqual([])
    expect(speakToken('contribution¹')).toEqual(['contribution'])
  })

  it('expands abbreviations that read badly aloud', () => {
    expect(speakToken('e.g.')).toEqual(['for', 'example'])
    expect(speakToken('Fig.')).toEqual(['figure'])
    expect(speakToken('approx.')).toEqual(['approximately'])
  })

  it('names maths and symbols', () => {
    expect(speakToken('>')).toEqual(['greater', 'than'])
    expect(speakToken('18%')).toEqual(['18', 'percent'])
    expect(speakToken('2.1%.')).toEqual(['2.1', 'percent.'])
    expect(speakToken('α')).toEqual(['alpha'])
  })

  it('replaces URLs, emails and bullets', () => {
    expect(speakToken('https://github.com/example/repo')).toEqual(['a link'])
    expect(speakToken('someone@example.com')).toEqual(['an email address'])
    expect(speakToken('•')).toEqual([])
  })

  it('leaves ordinary words alone', () => {
    expect(speakToken('Winston')).toEqual(['Winston'])
  })
})

describe('toSpeech', () => {
  it('keeps every spoken word pointing at its display token', () => {
    const speech = toSpeech('Growth was 18% year on year [4].')
    // The citation is dropped and its trailing full stop joins the word before it.
    expect(speech.text).toBe('Growth was 18 percent year on year.')
    expect(speech.tokens).toEqual(['Growth', 'was', '18%', 'year', 'on', 'year', '[4].'])
    // "18" and "percent" both come from the single display token "18%".
    expect(speech.words.map((word) => word.token)).toEqual([0, 1, 2, 2, 3, 4, 5])
  })

  it('maps a character offset back to the display token', () => {
    const speech = toSpeech('Growth was 18% year on year [4].')
    expect(tokenAtOffset(speech, 0)).toBe(0)
    expect(tokenAtOffset(speech, speech.text.indexOf('percent'))).toBe(2)
    expect(tokenAtOffset(speech, speech.text.length - 1)).toBe(5)
  })

  it('handles text that is entirely unspeakable', () => {
    const speech = toSpeech('• [12]')
    expect(speech.text).toBe('')
    expect(tokenAtOffset(speech, 0)).toBe(-1)
  })
})
