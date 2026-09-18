/**
 * Just enough of the ZIP format to read an EPUB.
 *
 * EPUBs are ordinary zips holding XHTML, and the browser can already inflate
 * deflate streams, so this reads the central directory itself rather than
 * pulling in a zip library for the handful of entries a book needs.
 */
export interface ZipEntry {
  name: string
  /** Offset of the local file header, not the data. */
  headerOffset: number
  compressedSize: number
  size: number
  /** 0 = stored, 8 = deflate. Anything else is refused. */
  method: number
}

const SIGNATURE = {
  endOfCentralDirectory: 0x06054b50,
  centralFile: 0x02014b50,
  localFile: 0x04034b50,
}

export class ZipArchive {
  private constructor(
    private readonly data: Uint8Array,
    private readonly entries: Map<string, ZipEntry>,
  ) {}

  static open(buffer: ArrayBuffer): ZipArchive {
    const data = new Uint8Array(buffer)
    const view = new DataView(buffer)
    const end = findEndOfCentralDirectory(view)
    const count = view.getUint16(end + 10, true)
    let offset = view.getUint32(end + 16, true)

    const entries = new Map<string, ZipEntry>()
    for (let i = 0; i < count; i++) {
      if (view.getUint32(offset, true) !== SIGNATURE.centralFile) {
        throw new Error('This file is not a readable EPUB: its directory is damaged.')
      }
      const nameLength = view.getUint16(offset + 28, true)
      const extraLength = view.getUint16(offset + 30, true)
      const commentLength = view.getUint16(offset + 32, true)
      const name = decodeUtf8(data.subarray(offset + 46, offset + 46 + nameLength))
      entries.set(name, {
        name,
        method: view.getUint16(offset + 10, true),
        compressedSize: view.getUint32(offset + 20, true),
        size: view.getUint32(offset + 24, true),
        headerOffset: view.getUint32(offset + 42, true),
      })
      offset += 46 + nameLength + extraLength + commentLength
    }

    return new ZipArchive(data, entries)
  }

  names(): string[] {
    return [...this.entries.keys()]
  }

  has(name: string): boolean {
    return this.entries.has(name)
  }

  async bytes(name: string): Promise<Uint8Array> {
    const entry = this.entries.get(name)
    if (!entry) throw new Error(`The EPUB is missing ${name}.`)

    const view = new DataView(this.data.buffer, this.data.byteOffset, this.data.byteLength)
    if (view.getUint32(entry.headerOffset, true) !== SIGNATURE.localFile) {
      throw new Error(`The EPUB entry ${name} is damaged.`)
    }
    // The local header repeats the name and carries its own extra field, whose
    // length can differ from the central directory's.
    const nameLength = view.getUint16(entry.headerOffset + 26, true)
    const extraLength = view.getUint16(entry.headerOffset + 28, true)
    const start = entry.headerOffset + 30 + nameLength + extraLength
    const compressed = this.data.subarray(start, start + entry.compressedSize)

    if (entry.method === 0) return compressed
    if (entry.method !== 8) {
      throw new Error(`The EPUB uses a compression method this reader does not support (${entry.method}).`)
    }
    return inflateRaw(compressed)
  }

  async text(name: string): Promise<string> {
    return decodeUtf8(await this.bytes(name))
  }
}

/** The directory lives at the end, behind a comment of unknown length. */
function findEndOfCentralDirectory(view: DataView): number {
  const maximumComment = 0xffff
  const earliest = Math.max(0, view.byteLength - maximumComment - 22)
  for (let offset = view.byteLength - 22; offset >= earliest; offset--) {
    if (view.getUint32(offset, true) === SIGNATURE.endOfCentralDirectory) return offset
  }
  throw new Error('This file is not a zip archive, so it cannot be an EPUB.')
}

async function inflateRaw(compressed: Uint8Array): Promise<Uint8Array> {
  if (typeof DecompressionStream === 'undefined') {
    throw new Error('This browser cannot decompress EPUB files. Try Chrome, Edge or Safari 16.4+.')
  }
  const stream = new Blob([compressed as BlobPart]).stream().pipeThrough(new DecompressionStream('deflate-raw'))
  return new Uint8Array(await new Response(stream).arrayBuffer())
}

function decodeUtf8(bytes: Uint8Array): string {
  return new TextDecoder('utf-8').decode(bytes)
}
