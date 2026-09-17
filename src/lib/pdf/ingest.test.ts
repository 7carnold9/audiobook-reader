import { describe, expect, it } from 'vitest'
import { countWords, usableAuthor, usableTitle } from './ingest'

describe('usableTitle', () => {
  it('keeps a real title', () => {
    expect(usableTitle('Nineteen Eighty-Four')).toBe('Nineteen Eighty-Four')
  })

  it('rejects exporter placeholders and filenames', () => {
    expect(usableTitle('untitled')).toBeNull()
    expect(usableTitle('Microsoft Word - draft3.doc')).toBeNull()
    expect(usableTitle('report-final.pdf')).toBeNull()
    expect(usableTitle('  ')).toBeNull()
  })
})

describe('usableAuthor', () => {
  it('drops default account names', () => {
    expect(usableAuthor('anonymous')).toBeNull()
    expect(usableAuthor('Administrator')).toBeNull()
    expect(usableAuthor(null)).toBeNull()
    expect(usableAuthor('George Orwell')).toBe('George Orwell')
  })
})

describe('countWords', () => {
  it('counts whitespace-separated words', () => {
    expect(countWords('  two  words ')).toBe(2)
    expect(countWords('')).toBe(0)
  })
})
