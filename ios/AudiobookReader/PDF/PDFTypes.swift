import Foundation

// The value types the extraction pipeline passes around. They mirror
// `src/lib/pdf/types.ts` one for one so the two implementations can be diffed
// against each other, with PDF user-space coordinates throughout: the origin is
// the bottom-left of the page, so a *larger* y is *higher* up the page.

/// A run of text on one visual line of a page, in PDF user-space coordinates.
public struct RawLine: Equatable, Sendable {
    public var text: String
    /// Left edge.
    public var x0: Double
    /// Right edge.
    public var x1: Double
    /// Baseline y. Larger y is higher up the page.
    public var y: Double
    public var fontSize: Double
    public var page: Int

    public init(text: String, x0: Double, x1: Double, y: Double, fontSize: Double, page: Int) {
        self.text = text
        self.x0 = x0
        self.x1 = x1
        self.y = y
        self.fontSize = fontSize
        self.page = page
    }
}

public struct RawPage: Equatable, Sendable {
    public var page: Int
    public var width: Double
    public var height: Double
    public var lines: [RawLine]

    public init(page: Int, width: Double, height: Double, lines: [RawLine]) {
        self.page = page
        self.width = width
        self.height = height
        self.lines = lines
    }
}

public struct OutlineEntry: Equatable, Sendable {
    public var title: String
    /// 1-based page number, or nil when the destination could not be resolved.
    public var page: Int?
    public var level: Int

    public init(title: String, page: Int?, level: Int) {
        self.title = title
        self.page = page
        self.level = level
    }
}

public struct ExtractedDocument: Equatable, Sendable {
    public var title: String
    public var author: String?
    public var pageCount: Int
    public var pages: [RawPage]
    public var outline: [OutlineEntry]

    public init(title: String, author: String?, pageCount: Int, pages: [RawPage], outline: [OutlineEntry]) {
        self.title = title
        self.author = author
        self.pageCount = pageCount
        self.pages = pages
        self.outline = outline
    }
}

/// A paragraph of body text, assembled from cleaned lines.
public struct Paragraph: Equatable, Sendable {
    public var text: String
    public var page: Int
    /// Set when the paragraph looks like a heading rather than prose.
    public var isHeading: Bool

    public init(text: String, page: Int, isHeading: Bool = false) {
        self.text = text
        self.page = page
        self.isHeading = isHeading
    }
}

/// The smallest unit that gets synthesized. Chunks are a synthesis detail, not
/// a unit of speech — `Narration` speaks sentences, which may cross chunks.
public struct Chunk: Equatable, Codable, Sendable, Identifiable {
    /// Index of this chunk within the book. Doubles as its identity.
    public var index: Int
    /// Text as shown in the transcript.
    public var text: String
    public var page: Int
    public var paragraph: Int
    /// True when this chunk opens a paragraph (used for transcript layout).
    public var startsParagraph: Bool
    public var isHeading: Bool

    public var id: Int { index }

    public init(
        index: Int,
        text: String,
        page: Int,
        paragraph: Int,
        startsParagraph: Bool,
        isHeading: Bool = false
    ) {
        self.index = index
        self.text = text
        self.page = page
        self.paragraph = paragraph
        self.startsParagraph = startsParagraph
        self.isHeading = isHeading
    }
}

public struct Chapter: Equatable, Codable, Sendable, Identifiable {
    public var title: String
    /// Index of the first chunk of the chapter.
    public var chunkIndex: Int
    public var page: Int
    public var level: Int

    public var id: Int { chunkIndex }

    public init(title: String, chunkIndex: Int, page: Int, level: Int) {
        self.title = title
        self.chunkIndex = chunkIndex
        self.page = page
        self.level = level
    }
}

/// A positioned run of glyphs, before any line grouping. This is the seam the
/// PDFKit adapter fills: everything downstream works on `TextRun` values and
/// never touches PDFKit, which is what makes the pipeline unit-testable.
public struct TextRun: Equatable, Sendable {
    public var text: String
    public var x0: Double
    public var x1: Double
    /// Baseline y in PDF user space.
    public var y: Double
    public var fontSize: Double

    public init(text: String, x0: Double, x1: Double, y: Double, fontSize: Double) {
        self.text = text
        self.x0 = x0
        self.x1 = x1
        self.y = y
        self.fontSize = fontSize
    }
}
