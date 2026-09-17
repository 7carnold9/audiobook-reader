/** A run of text on one visual line of a page, in PDF user-space coordinates. */
export interface RawLine {
  text: string
  /** Left edge. */
  x0: number
  /** Right edge. */
  x1: number
  /** Baseline y. PDF space has its origin at the bottom-left, so larger y is higher. */
  y: number
  fontSize: number
  page: number
}

export interface RawPage {
  page: number
  width: number
  height: number
  lines: RawLine[]
}

export interface OutlineEntry {
  title: string
  /** 1-based page number, or null when the destination could not be resolved. */
  page: number | null
  level: number
}

export interface ExtractedDocument {
  title: string
  author: string | null
  pageCount: number
  pages: RawPage[]
  outline: OutlineEntry[]
}

/** A paragraph of body text, assembled from cleaned lines. */
export interface Paragraph {
  text: string
  page: number
  /** Set when the paragraph looks like a heading rather than prose. */
  heading?: boolean
}

/** The smallest unit that gets synthesized and cached. */
export interface Chunk {
  /** Index of this chunk within the book. */
  index: number
  /** Text as shown in the transcript. */
  text: string
  page: number
  paragraph: number
  /** True when this chunk opens a paragraph (used for transcript layout). */
  startsParagraph: boolean
  heading?: boolean
}

export interface Chapter {
  title: string
  /** Index of the first chunk of the chapter. */
  chunkIndex: number
  page: number
  level: number
}
