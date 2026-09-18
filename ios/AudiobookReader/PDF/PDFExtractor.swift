import CoreGraphics
import Foundation
import PDFKit
import UIKit

public enum ExtractionError: LocalizedError {
    case cannotOpen
    case locked
    case cancelled
    case noText

    public var errorDescription: String? {
        switch self {
        case .cannotOpen:
            return "This file could not be opened as a PDF."
        case .locked:
            return "This PDF is password protected."
        case .cancelled:
            return "Import cancelled."
        case .noText:
            return "No text could be extracted from this PDF. It is most likely a scan of "
                + "a printed page, which needs OCR before it can be read aloud."
        }
    }
}

/// Pulls text out of a PDF page by page, grouping positioned glyphs back into
/// visual lines. Ordering, header/footer removal and paragraph assembly happen
/// later in `cleanPages` — this stage stays faithful to what is on the page.
///
/// PDFKit has no equivalent of pdf.js's `TextItem`, so the positions come from
/// `PDFPage.characterBounds(at:)`, one call per character, merged into
/// word-sized runs. Deliberately *not* `PDFSelection.selectionsByLine()`: that
/// uses PDFKit's own idea of a line, which can run straight across a two-column
/// gutter — the exact failure `groupIntoLines` exists to prevent.
public enum PDFTextExtractor {
    public struct Progress {
        public var fraction: Double
        public var page: Int
        public var pageCount: Int
    }

    public static func extract(
        url: URL,
        onProgress: ((Progress) -> Void)? = nil,
        isCancelled: () -> Bool = { false }
    ) throws -> ExtractedDocument {
        guard let document = PDFDocument(url: url) else { throw ExtractionError.cannotOpen }
        if document.isLocked { throw ExtractionError.locked }

        let pageCount = document.pageCount
        var pages: [RawPage] = []
        pages.reserveCapacity(pageCount)

        for index in 0..<pageCount {
            if isCancelled() { throw ExtractionError.cancelled }
            guard let page = document.page(at: index) else { continue }
            pages.append(rawPage(from: page, number: index + 1))
            onProgress?(
                Progress(
                    fraction: Double(index + 1) / Double(max(pageCount, 1)),
                    page: index + 1,
                    pageCount: pageCount
                )
            )
        }

        let attributes = document.documentAttributes ?? [:]
        let title = (attributes[PDFDocumentAttribute.titleAttribute] as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)
        let author = (attributes[PDFDocumentAttribute.authorAttribute] as? String ?? "")
            .trimmingCharacters(in: .whitespacesAndNewlines)

        return ExtractedDocument(
            title: title,
            author: author.isEmpty ? nil : author,
            pageCount: pageCount,
            pages: pages,
            outline: readOutline(document)
        )
    }

    // MARK: - One page

    static func rawPage(from page: PDFPage, number: Int) -> RawPage {
        let bounds = page.bounds(for: .cropBox)
        let runs = textRuns(from: page, origin: bounds.origin)
        return RawPage(
            page: number,
            width: Double(bounds.width),
            height: Double(bounds.height),
            lines: groupIntoLines(runs, page: number)
        )
    }

    /// Word-sized runs in crop-box-relative PDF user space.
    ///
    /// Coordinates are shifted by the crop box origin so that the fractions in
    /// `cleanPages` ("is this line in the top 8% of the page?") mean what they
    /// say on a document whose crop box does not start at zero.
    static func textRuns(from page: PDFPage, origin: CGPoint) -> [TextRun] {
        let text = page.string ?? ""
        guard !text.isEmpty else { return [] }

        let nsText = text as NSString
        let count = min(nsText.length, page.numberOfCharacters)
        guard count > 0 else { return [] }

        let declaredSizes = fontSizes(for: page, length: nsText.length)

        var runs: [TextRun] = []
        var buffer = ""
        var minX = Double.greatestFiniteMagnitude
        var maxX = -Double.greatestFiniteMagnitude
        var baseline = 0.0
        var glyphHeight = 0.0
        var declared = 0.0

        func flush() {
            defer {
                buffer = ""
                minX = .greatestFiniteMagnitude
                maxX = -.greatestFiniteMagnitude
                glyphHeight = 0
                declared = 0
            }
            guard !buffer.isEmpty, minX <= maxX else { return }
            // A declared font size from the page's attributed string is better
            // than a glyph box when it is available; the glyph box is the
            // fallback, and it over-reports by the leading.
            let fontSize = declared > 0 ? declared : glyphHeight
            runs.append(
                TextRun(
                    text: buffer,
                    x0: minX,
                    x1: maxX,
                    y: baseline,
                    fontSize: fontSize > 0 ? fontSize : 10
                )
            )
        }

        var index = 0
        while index < count {
            let range = nsText.rangeOfComposedCharacterSequence(at: index)
            let piece = nsText.substring(with: range)
            let rect = page.characterBounds(at: index)
            let usable = !rect.isNull && !rect.isInfinite && rect.height > 0 && rect.width >= 0

            if !usable || piece.allSatisfy({ $0.isWhitespace || $0.isNewline }) {
                // Whitespace is dropped here and reinstated by `groupIntoLines`
                // from the geometry, which is also what decides whether a gap is
                // a word space or a column gutter.
                flush()
                index = range.location + range.length
                continue
            }

            let x0 = Double(rect.minX) - Double(origin.x)
            let x1 = Double(rect.maxX) - Double(origin.x)
            let y = Double(rect.minY) - Double(origin.y)
            let height = Double(rect.height)
            let sameRun = !buffer.isEmpty
                && abs(y - baseline) <= max(1.0, glyphHeight * 0.4)
                && x0 >= maxX - height * 0.5
                && x0 - maxX < height * 0.6

            if !sameRun { flush() }
            if buffer.isEmpty { baseline = y }

            buffer += piece
            minX = min(minX, x0)
            maxX = max(maxX, x1)
            glyphHeight = max(glyphHeight, height)
            if let sizes = declaredSizes, range.location < sizes.count {
                declared = max(declared, sizes[range.location])
            }

            index = range.location + range.length
        }
        flush()

        return runs
    }

    /// Per-character font point sizes read off the page's attributed string, or
    /// nil when PDFKit will not give a string that lines up with `page.string`.
    ///
    /// GUESS: the two are documented to describe the same text, but nothing
    /// promises identical lengths, so the lengths are checked before use.
    static func fontSizes(for page: PDFPage, length: Int) -> [Double]? {
        guard let attributed = page.attributedString, attributed.length == length, length > 0 else {
            return nil
        }
        var sizes = [Double](repeating: 0, count: length)
        attributed.enumerateAttribute(
            .font,
            in: NSRange(location: 0, length: length),
            options: []
        ) { value, range, _ in
            guard let font = value as? UIFont else { return }
            let size = Double(font.pointSize)
            for index in range.location..<NSMaxRange(range) where index < sizes.count {
                sizes[index] = size
            }
        }
        return sizes
    }

    // MARK: - Outline

    static func readOutline(_ document: PDFDocument) -> [OutlineEntry] {
        guard let root = document.outlineRoot else { return [] }
        var entries: [OutlineEntry] = []

        func walk(_ node: PDFOutline, level: Int) {
            for index in 0..<node.numberOfChildren {
                guard let child = node.child(at: index) else { continue }
                let title = Scan.squashWhitespace(child.label ?? "")
                if !title.isEmpty {
                    entries.append(
                        OutlineEntry(title: title, page: pageNumber(of: child, in: document), level: level)
                    )
                }
                walk(child, level: level + 1)
            }
        }

        walk(root, level: 0)
        return entries
    }

    private static func pageNumber(of outline: PDFOutline, in document: PDFDocument) -> Int? {
        // A bookmark carries either a destination or a go-to action; both can be
        // absent (a heading-only node), and both can point at a page PDFKit
        // cannot resolve.
        if let page = outline.destination?.page {
            return document.index(for: page) + 1
        }
        if let action = outline.action as? PDFActionGoTo, let page = action.destination.page {
            return document.index(for: page) + 1
        }
        return nil
    }
}
