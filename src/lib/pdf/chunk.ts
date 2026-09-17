import type { Chunk, Paragraph } from './types'

/** Target chunk size in characters. Small enough to start fast, large enough to sound natural. */
const TARGET = 320
const MAX = 480

/**
 * Splits paragraphs into sentence-aligned chunks. Chunks are the unit of
 * synthesis and caching, so they must be stable: the same paragraphs always
 * produce the same chunks.
 */
export function chunkParagraphs(paragraphs: Paragraph[]): Chunk[] {
  const chunks: Chunk[] = []
  paragraphs.forEach((paragraph, paragraphIndex) => {
    const pieces = paragraph.heading
      ? [paragraph.text]
      : packSentences(splitSentences(paragraph.text))
    pieces.forEach((text, i) => {
      chunks.push({
        index: chunks.length,
        text,
        page: paragraph.page,
        paragraph: paragraphIndex,
        startsParagraph: i === 0,
        ...(paragraph.heading ? { heading: true } : {}),
      })
    })
  })
  return chunks
}

/**
 * Sentence splitter that keeps common abbreviations, initials, decimals and
 * citation markers from being mistaken for sentence ends.
 */
export function splitSentences(text: string): string[] {
  const ABBREVIATIONS = new Set([
    'mr', 'mrs', 'ms', 'dr', 'prof', 'st', 'sr', 'jr', 'vs', 'etc', 'al', 'fig', 'figs',
    'eq', 'no', 'vol', 'pp', 'ed', 'eds', 'cf', 'e.g', 'i.e', 'approx', 'inc', 'ltd', 'co',
  ])
  const sentences: string[] = []
  let start = 0
  for (let i = 0; i < text.length; i++) {
    if (!'.!?'.includes(text[i])) continue
    // Consume closing quotes/brackets that belong to this sentence.
    let end = i + 1
    while (end < text.length && '"\')]”’'.includes(text[end])) end++
    const next = text[end]
    if (next !== undefined && next !== ' ') continue
    const after = text.slice(end + 1)
    // A sentence must be followed by something that can open one.
    if (after && !/^["'(“‘—]?[A-Z0-9]/.test(after)) continue
    const before = text.slice(start, i)
    const lastWord = before.split(/[\s(]/).pop()?.toLowerCase() ?? ''
    if (text[i] === '.') {
      if (ABBREVIATIONS.has(lastWord.replace(/[^a-z.]/g, ''))) continue
      if (/^[a-z]$/.test(lastWord)) continue // initial, e.g. "J. R. R."
      if (/\d$/.test(lastWord) && /^\d/.test(after)) continue // decimal or version number
    }
    const sentence = text.slice(start, end).trim()
    if (sentence) sentences.push(sentence)
    start = end + 1
  }
  const tail = text.slice(start).trim()
  if (tail) sentences.push(tail)
  return sentences
}

/** Greedily packs sentences up to TARGET characters, hard-splitting anything huge. */
function packSentences(sentences: string[]): string[] {
  const out: string[] = []
  let current = ''
  const push = () => {
    const text = current.trim()
    if (text) out.push(text)
    current = ''
  }
  for (const sentence of sentences) {
    if (sentence.length > MAX) {
      push()
      out.push(...hardSplit(sentence))
      continue
    }
    if (current && current.length + sentence.length + 1 > TARGET) push()
    current = current ? `${current} ${sentence}` : sentence
  }
  push()
  return out.length ? out : []
}

/** Splits an over-long sentence at clause boundaries, then at word boundaries. */
function hardSplit(sentence: string): string[] {
  const parts: string[] = []
  let current = ''
  for (const piece of sentence.split(/(?<=[,;:—])\s+/)) {
    if (current && current.length + piece.length + 1 > TARGET) {
      parts.push(current.trim())
      current = ''
    }
    current = current ? `${current} ${piece}` : piece
  }
  if (current.trim()) parts.push(current.trim())

  return parts.flatMap((part) => {
    if (part.length <= MAX) return [part]
    const words = part.split(' ')
    const out: string[] = []
    let buffer = ''
    for (const word of words) {
      if (buffer && buffer.length + word.length + 1 > TARGET) {
        out.push(buffer)
        buffer = ''
      }
      buffer = buffer ? `${buffer} ${word}` : word
    }
    if (buffer) out.push(buffer)
    return out
  })
}
