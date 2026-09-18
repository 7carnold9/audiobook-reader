"""Builds the EPUB fixtures the parser tests run against.

Two files: an EPUB 3 with a nav document, and an EPUB 2 with an NCX, since the
table of contents is spelled differently in each and both are still in the wild.
"""
import sys
import zipfile

CONTAINER = """<?xml version="1.0"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
  <rootfiles>
    <rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/>
  </rootfiles>
</container>"""

OPF3 = """<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="id">
  <metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
    <dc:title>The Time Machine</dc:title>
    <dc:creator>H. G. Wells</dc:creator>
    <dc:language>en</dc:language>
  </metadata>
  <manifest>
    <item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
    <item id="ch1" href="text/ch1.xhtml" media-type="application/xhtml+xml"/>
    <item id="ch2" href="text/ch2.xhtml" media-type="application/xhtml+xml"/>
    <item id="cover" href="cover.xhtml" media-type="application/xhtml+xml"/>
    <item id="css" href="style.css" media-type="text/css"/>
  </manifest>
  <spine>
    <itemref idref="cover" linear="no"/>
    <itemref idref="ch1"/>
    <itemref idref="ch2"/>
  </spine>
</package>"""

NAV = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">
<body>
  <nav epub:type="landmarks"><ol><li><a href="text/ch1.xhtml">Start</a></li></ol></nav>
  <nav epub:type="toc">
    <ol>
      <li><a href="text/ch1.xhtml">I. The Inventor</a>
        <ol><li><a href="text/ch1.xhtml#part2">A digression</a></li></ol>
      </li>
      <li><a href="text/ch2.xhtml">II. The Machine</a></li>
    </ol>
  </nav>
</body>
</html>"""

CH1 = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<head><title>Chapter I</title><style>p { color: red }</style></head>
<body>
  <h1>I. The Inventor</h1>
  <p>The Time Traveller &#8212; for so it will be convenient to speak of him &#8212;
     was expounding a recondite matter to us.</p>
  <p>His grey eyes shone and twinkled,<br/>and his usually pale face was flushed
     &amp; animated. &#x201C;Follow me carefully,&#x201D; he said.</p>
  <script>console.log('not part of the book')</script>
  <p id="part2">The fire burned brightly.</p>
</body>
</html>"""

CH2 = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml">
<body>
  <h1>II. The Machine</h1>
  <p>It was of glittering metallic framework, barely larger than a clock.</p>
</body>
</html>"""

COVER = """<?xml version="1.0" encoding="utf-8"?>
<html xmlns="http://www.w3.org/1999/xhtml"><body><p>Cover</p></body></html>"""

OPF2 = OPF3.replace('version="3.0"', 'version="2.0"') \
    .replace('<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>',
             '<item id="ncx" href="toc.ncx" media-type="application/x-dtbncx+xml"/>') \
    .replace('<spine>', '<spine toc="ncx">')

NCX = """<?xml version="1.0" encoding="utf-8"?>
<ncx xmlns="http://www.daisy.org/z3986/2005/ncx/" version="2005-1">
  <docTitle><text>The Time Machine</text></docTitle>
  <navMap>
    <navPoint id="n1" playOrder="1">
      <navLabel><text>I. The Inventor</text></navLabel>
      <content src="text/ch1.xhtml"/>
      <navPoint id="n1a" playOrder="2">
        <navLabel><text>A digression</text></navLabel>
        <content src="text/ch1.xhtml#part2"/>
      </navPoint>
    </navPoint>
    <navPoint id="n2" playOrder="3">
      <navLabel><text>II. The Machine</text></navLabel>
      <content src="text/ch2.xhtml"/>
    </navPoint>
  </navMap>
</ncx>"""


def build(path, opf, toc_name, toc):
    with zipfile.ZipFile(path, "w") as zf:
        # The mimetype entry must be first and stored, per the spec.
        zf.writestr(zipfile.ZipInfo("mimetype"), "application/epub+zip", zipfile.ZIP_STORED)
        for name, body in [
            ("META-INF/container.xml", CONTAINER),
            ("OEBPS/content.opf", opf),
            (f"OEBPS/{toc_name}", toc),
            ("OEBPS/text/ch1.xhtml", CH1),
            ("OEBPS/text/ch2.xhtml", CH2),
            ("OEBPS/cover.xhtml", COVER),
            ("OEBPS/style.css", "p { margin: 1em 0 }"),
        ]:
            zf.writestr(name, body, zipfile.ZIP_DEFLATED)


out = sys.argv[1]
build(f"{out}/sample.epub", OPF3, "nav.xhtml", NAV)
build(f"{out}/sample-epub2.epub", OPF2, "toc.ncx", NCX)
print("wrote sample.epub and sample-epub2.epub")
