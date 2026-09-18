/**
 * A very small XML/XHTML tokenizer.
 *
 * EPUB content is well-formed XHTML, and the handful of things this app needs
 * from it — the spine, the table of contents, and block-level text — do not
 * justify a parser dependency. Keeping it a pure function also means the EPUB
 * pipeline can be tested in Node without a DOM.
 */
export type Token =
  | { kind: 'open'; name: string; attrs: Record<string, string>; selfClosing: boolean }
  | { kind: 'close'; name: string }
  | { kind: 'text'; text: string }

export function tokenize(markup: string): Token[] {
  const tokens: Token[] = []
  let i = 0

  while (i < markup.length) {
    const next = markup.indexOf('<', i)
    if (next === -1) {
      pushText(tokens, markup.slice(i))
      break
    }
    if (next > i) pushText(tokens, markup.slice(i, next))

    // Comments, CDATA, doctypes and processing instructions carry nothing we need.
    if (markup.startsWith('<!--', next)) {
      i = skipPast(markup, next, '-->')
      continue
    }
    if (markup.startsWith('<![CDATA[', next)) {
      const end = markup.indexOf(']]>', next)
      const text = end === -1 ? markup.slice(next + 9) : markup.slice(next + 9, end)
      tokens.push({ kind: 'text', text })
      i = end === -1 ? markup.length : end + 3
      continue
    }
    if (markup.startsWith('<!', next) || markup.startsWith('<?', next)) {
      i = skipPast(markup, next, '>')
      continue
    }

    const end = findTagEnd(markup, next)
    if (end === -1) {
      pushText(tokens, markup.slice(next))
      break
    }
    const raw = markup.slice(next + 1, end)
    i = end + 1

    if (raw.startsWith('/')) {
      tokens.push({ kind: 'close', name: localName(raw.slice(1).trim()) })
      continue
    }

    const selfClosing = raw.endsWith('/')
    const body = selfClosing ? raw.slice(0, -1) : raw
    const nameMatch = /^([^\s/>]+)/.exec(body)
    if (!nameMatch) continue
    tokens.push({
      kind: 'open',
      name: localName(nameMatch[1]),
      attrs: parseAttributes(body.slice(nameMatch[1].length)),
      selfClosing,
    })
  }

  return tokens
}

/** `epub:type` and `dc:title` are the same tag whatever the prefix. */
function localName(name: string): string {
  const colon = name.indexOf(':')
  return (colon === -1 ? name : name.slice(colon + 1)).toLowerCase()
}

/** Angle brackets inside a quoted attribute value do not end the tag. */
function findTagEnd(markup: string, start: number): number {
  let quote: string | null = null
  for (let i = start + 1; i < markup.length; i++) {
    const char = markup[i]
    if (quote) {
      if (char === quote) quote = null
    } else if (char === '"' || char === "'") {
      quote = char
    } else if (char === '>') {
      return i
    }
  }
  return -1
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {}
  const pattern = /([^\s=/>]+)\s*(?:=\s*("([^"]*)"|'([^']*)'|([^\s"'>]+)))?/g
  let match = pattern.exec(source)
  while (match) {
    const value = match[3] ?? match[4] ?? match[5] ?? ''
    attrs[localName(match[1])] = decodeEntities(value)
    match = pattern.exec(source)
  }
  return attrs
}

function pushText(tokens: Token[], text: string): void {
  if (text) tokens.push({ kind: 'text', text: decodeEntities(text) })
}

function skipPast(markup: string, from: number, terminator: string): number {
  const end = markup.indexOf(terminator, from)
  return end === -1 ? markup.length : end + terminator.length
}

const NAMED_ENTITIES: Record<string, string> = {
  amp: '&',
  lt: '<',
  gt: '>',
  quot: '"',
  apos: "'",
  nbsp: ' ',
  mdash: '—',
  ndash: '–',
  hellip: '…',
  lsquo: '‘',
  rsquo: '’',
  ldquo: '“',
  rdquo: '”',
  laquo: '«',
  raquo: '»',
  eacute: 'é',
  egrave: 'è',
  agrave: 'à',
  ccedil: 'ç',
  uuml: 'ü',
  ouml: 'ö',
  auml: 'ä',
  szlig: 'ß',
  copy: '©',
  reg: '®',
  trade: '™',
  deg: '°',
  shy: '',
}

export function decodeEntities(text: string): string {
  if (!text.includes('&')) return text
  return text.replace(/&(#x?[0-9a-f]+|[a-z][a-z0-9]*);/gi, (whole, body: string) => {
    if (body.startsWith('#x') || body.startsWith('#X')) {
      return codePoint(parseInt(body.slice(2), 16)) ?? whole
    }
    if (body.startsWith('#')) return codePoint(Number(body.slice(1))) ?? whole
    return NAMED_ENTITIES[body.toLowerCase()] ?? whole
  })
}

function codePoint(value: number): string | null {
  return Number.isFinite(value) && value >= 0 && value <= 0x10ffff ? String.fromCodePoint(value) : null
}
