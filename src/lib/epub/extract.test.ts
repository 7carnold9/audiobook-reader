import { describe, expect, it } from 'vitest'
import { documentParagraphs, parseContainer, parseNav, parseNcx, parsePackage, resolvePath } from './extract'

describe('resolvePath', () => {
  it('resolves relative to the referring file and drops fragments', () => {
    expect(resolvePath('OEBPS/content.opf', 'text/ch1.xhtml')).toBe('OEBPS/text/ch1.xhtml')
    expect(resolvePath('OEBPS/nav.xhtml', 'text/ch1.xhtml#part2')).toBe('OEBPS/text/ch1.xhtml')
    expect(resolvePath('OEBPS/text/nav.xhtml', '../images/x.png')).toBe('OEBPS/images/x.png')
    expect(resolvePath('OEBPS/nav.xhtml', '/OEBPS/ch1.xhtml')).toBe('OEBPS/ch1.xhtml')
  })
})

describe('parseContainer', () => {
  it('finds the package document', () => {
    expect(
      parseContainer('<container><rootfiles><rootfile full-path="OEBPS/book.opf"/></rootfiles></container>'),
    ).toBe('OEBPS/book.opf')
  })

  it('complains when there is none', () => {
    expect(() => parseContainer('<container/>')).toThrow(/no package document/i)
  })
})

describe('parsePackage', () => {
  const opf = `<package>
    <metadata><dc:title>The Time Machine</dc:title><dc:creator>H. G. Wells</dc:creator></metadata>
    <manifest>
      <item id="nav" href="nav.xhtml" properties="nav"/>
      <item id="ch1" href="text/ch1.xhtml"/>
      <item id="ch2" href="text/ch2.xhtml"/>
      <item id="cover" href="cover.xhtml"/>
    </manifest>
    <spine toc="ncx">
      <itemref idref="cover" linear="no"/>
      <itemref idref="ch1"/>
      <itemref idref="ch2"/>
    </spine>
  </package>`

  it('reads the title, author and reading order', () => {
    const pkg = parsePackage(opf, 'OEBPS/content.opf')
    expect(pkg.title).toBe('The Time Machine')
    expect(pkg.author).toBe('H. G. Wells')
    expect(pkg.spine).toEqual(['OEBPS/text/ch1.xhtml', 'OEBPS/text/ch2.xhtml'])
    expect(pkg.navPath).toBe('OEBPS/nav.xhtml')
  })

  it('skips spine entries marked non-linear', () => {
    expect(parsePackage(opf, 'OEBPS/content.opf').spine).not.toContain('OEBPS/cover.xhtml')
  })
})

describe('parseNav', () => {
  const nav = `<html><body>
    <nav epub:type="landmarks"><ol><li><a href="text/ch1.xhtml">Start reading</a></li></ol></nav>
    <nav epub:type="toc"><ol>
      <li><a href="text/ch1.xhtml">One</a><ol><li><a href="text/ch1.xhtml#b">One (b)</a></li></ol></li>
      <li><a href="text/ch2.xhtml">Two</a></li>
    </ol></nav>
  </body></html>`

  it('reads only the table of contents, with nesting as levels', () => {
    expect(parseNav(nav, 'OEBPS/nav.xhtml')).toEqual([
      { title: 'One', href: 'OEBPS/text/ch1.xhtml', level: 0 },
      { title: 'One (b)', href: 'OEBPS/text/ch1.xhtml', level: 1 },
      { title: 'Two', href: 'OEBPS/text/ch2.xhtml', level: 0 },
    ])
  })
})

describe('parseNcx', () => {
  it('reads nested navPoints from an EPUB 2 table of contents', () => {
    const ncx = `<ncx><navMap>
      <navPoint><navLabel><text>One</text></navLabel><content src="text/ch1.xhtml"/>
        <navPoint><navLabel><text>One (b)</text></navLabel><content src="text/ch1.xhtml#b"/></navPoint>
      </navPoint>
      <navPoint><navLabel><text>Two</text></navLabel><content src="text/ch2.xhtml"/></navPoint>
    </navMap></ncx>`
    expect(parseNcx(ncx, 'OEBPS/toc.ncx')).toEqual([
      { title: 'One', href: 'OEBPS/text/ch1.xhtml', level: 0 },
      { title: 'One (b)', href: 'OEBPS/text/ch1.xhtml', level: 1 },
      { title: 'Two', href: 'OEBPS/text/ch2.xhtml', level: 0 },
    ])
  })
})

describe('documentParagraphs', () => {
  it('splits on block elements and marks headings', () => {
    const html = `<html><body><h1>Chapter One</h1><p>First para.</p><p>Second para.</p></body></html>`
    expect(documentParagraphs(html, 3)).toEqual([
      { text: 'Chapter One', page: 3, heading: true },
      { text: 'First para.', page: 3 },
      { text: 'Second para.', page: 3 },
    ])
  })

  it('leaves out scripts, styles and the document title', () => {
    const html = `<html><head><title>Ignored</title><style>p{}</style></head>
      <body><p>Kept.</p><script>var x = 1</script></body></html>`
    expect(documentParagraphs(html, 1).map((p) => p.text)).toEqual(['Kept.'])
  })

  it('keeps a line break inside its paragraph and collapses whitespace', () => {
    const html = '<p>One line,<br/>  and   the\n next.</p>'
    expect(documentParagraphs(html, 1)[0].text).toBe('One line, and the next.')
  })

  it('decodes entities in the text', () => {
    expect(documentParagraphs('<p>Tom &amp; Jerry &#8212; friends</p>', 1)[0].text).toBe(
      'Tom & Jerry — friends',
    )
  })

  it('ignores markup that carries no text', () => {
    expect(documentParagraphs('<html><body><div></div><p>  </p></body></html>', 1)).toEqual([])
  })
})

describe('parseNcx titles', () => {
  it('ignores the document title, which uses the same tag as a chapter label', () => {
    const ncx = `<ncx>
      <docTitle><text>The Whole Book</text></docTitle>
      <navMap><navPoint><navLabel><text>One</text></navLabel><content src="ch1.xhtml"/></navPoint></navMap>
    </ncx>`
    expect(parseNcx(ncx, 'toc.ncx')).toEqual([{ title: 'One', href: 'ch1.xhtml', level: 0 }])
  })
})
