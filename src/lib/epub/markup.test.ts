import { describe, expect, it } from 'vitest'
import { decodeEntities, tokenize } from './markup'

describe('tokenize', () => {
  it('reads tags, attributes and text', () => {
    expect(tokenize('<p class="first">Hello</p>')).toEqual([
      { kind: 'open', name: 'p', attrs: { class: 'first' }, selfClosing: false },
      { kind: 'text', text: 'Hello' },
      { kind: 'close', name: 'p' },
    ])
  })

  it('drops namespace prefixes so dc:title and title are the same tag', () => {
    const [token] = tokenize('<dc:title>Book</dc:title>')
    expect(token).toMatchObject({ kind: 'open', name: 'title' })
  })

  it('does not end a tag at an angle bracket inside an attribute', () => {
    const [token] = tokenize('<a href="?a=1&amp;b=2" title="x > y">t</a>')
    expect(token).toMatchObject({ attrs: { href: '?a=1&b=2', title: 'x > y' } })
  })

  it('marks self-closing tags', () => {
    expect(tokenize('<br/>')).toEqual([
      { kind: 'open', name: 'br', attrs: {}, selfClosing: true },
    ])
  })

  it('skips comments, doctypes and declarations but keeps CDATA text', () => {
    expect(tokenize('<!DOCTYPE html><!-- note --><?xml version="1.0"?><p>x</p>')).toEqual([
      { kind: 'open', name: 'p', attrs: {}, selfClosing: false },
      { kind: 'text', text: 'x' },
      { kind: 'close', name: 'p' },
    ])
    expect(tokenize('<p><![CDATA[raw < text]]></p>')[1]).toEqual({ kind: 'text', text: 'raw < text' })
  })
})

describe('decodeEntities', () => {
  it('decodes named, decimal and hex entities', () => {
    expect(decodeEntities('Tom &amp; Jerry')).toBe('Tom & Jerry')
    expect(decodeEntities('dash &#8212; here')).toBe('dash — here')
    expect(decodeEntities('quote &#x201C;x&#x201D;')).toBe('quote “x”')
    expect(decodeEntities('caf&eacute;')).toBe('café')
  })

  it('leaves unknown entities alone', () => {
    expect(decodeEntities('&notanentity; &')).toBe('&notanentity; &')
  })
})
