import Foundation

public struct IngestProgress: Equatable, Sendable {
    public enum Stage: String, Sendable {
        case reading, extracting, cleaning, done
    }

    public var stage: Stage
    public var fraction: Double
    public var page: Int?
    public var pageCount: Int?

    public init(stage: Stage, fraction: Double, page: Int? = nil, pageCount: Int? = nil) {
        self.stage = stage
        self.fraction = fraction
        self.page = page
        self.pageCount = pageCount
    }
}

/// The result of ingesting one PDF: everything the reader needs, and nothing
/// that has to be recomputed on open.
public struct IngestedBook: Equatable, Sendable {
    public var title: String
    public var author: String?
    public var pageCount: Int
    public var wordCount: Int
    public var chunks: [Chunk]
    public var chapters: [Chapter]
    public var stats: CleanStats
}

/// Runs the full ingest pipeline: extract, clean, chunk, detect chapters.
///
/// Synchronous and pure apart from the file read, so it can be run off the main
/// thread by whatever owns it — a four-hundred-page book is seconds of work.
public func ingestPDF(
    at url: URL,
    fallbackTitle: String,
    onProgress: ((IngestProgress) -> Void)? = nil,
    isCancelled: () -> Bool = { false }
) throws -> IngestedBook {
    onProgress?(IngestProgress(stage: .reading, fraction: 0))

    let document = try PDFTextExtractor.extract(
        url: url,
        onProgress: { progress in
            // Extraction is the slow part, so it owns most of the progress bar.
            onProgress?(
                IngestProgress(
                    stage: .extracting,
                    fraction: progress.fraction * 0.9,
                    page: progress.page,
                    pageCount: progress.pageCount
                )
            )
        },
        isCancelled: isCancelled
    )

    onProgress?(IngestProgress(stage: .cleaning, fraction: 0.92))
    let cleaned = cleanPages(document.pages)
    let chunks = chunkParagraphs(cleaned.paragraphs)
    guard !chunks.isEmpty else { throw ExtractionError.noText }

    let chapters = buildChapters(chunks: chunks, outline: document.outline)
    let wordCount = chunks.reduce(0) { $0 + countWords($1.text) }

    onProgress?(IngestProgress(stage: .done, fraction: 1))

    return IngestedBook(
        title: usableTitle(document.title) ?? fallbackTitle,
        author: usableAuthor(document.author),
        pageCount: document.pageCount,
        wordCount: wordCount,
        chunks: chunks,
        chapters: chapters,
        stats: cleaned.stats
    )
}

private let placeholderTitles: Set<String> = ["untitled", "unknown", "microsoft word", "pdf document"]
private let placeholderAuthors: Set<String> = ["anonymous", "unknown", "user", "administrator", "owner"]
private let sourceFileExtensions = ["doc", "docx", "pdf", "indd", "tex", "pages", "odt"]

/// PDF metadata titles are unreliable — exporters leave behind placeholders and
/// source filenames — so obvious junk falls back to the file name.
public func usableTitle(_ title: String) -> String? {
    let trimmed = title.trimmingCharacters(in: .whitespacesAndNewlines)
    guard trimmed.count >= 2 else { return nil }
    let lower = trimmed.lowercased()

    if placeholderTitles.contains(lower) { return nil }
    // `document`, `document1`, `document12`…
    if lower.hasPrefix("document"), lower.dropFirst(8).allSatisfy({ Scan.asciiDigits.contains($0) }) {
        return nil
    }
    // `Microsoft Word - draft3.doc`
    if lower.hasPrefix("microsoft word"),
       lower.dropFirst(14).drop(while: { $0.isWhitespace }).hasPrefix("-") {
        return nil
    }
    for ext in sourceFileExtensions where lower.hasSuffix(".\(ext)") { return nil }
    return trimmed
}

public func usableAuthor(_ author: String?) -> String? {
    let trimmed = (author ?? "").trimmingCharacters(in: .whitespacesAndNewlines)
    guard !trimmed.isEmpty else { return nil }
    if placeholderAuthors.contains(trimmed.lowercased()) { return nil }
    return trimmed
}

public func countWords(_ text: String) -> Int {
    Scan.words(text).count
}
