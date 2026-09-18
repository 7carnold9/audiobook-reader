import Foundation

/// Local-first storage: `Codable` over `FileManager`, no accounts, no network.
///
/// Layout, under Application Support:
///
///     Library/
///       index.json                 [BookSummary]
///       settings.json              AppSettings
///       Books/<uuid>/
///         source.pdf               the original, kept so a book can be re-ingested
///         contents.json            chunks + chapters + cleaning stats
///         position.json            where the reader got to
///         bookmarks.json           [Bookmark]
///
/// The store keeps no mutable state of its own — everything is on disk and every
/// write is atomic — so it is safe to hand to a background import task.
public final class LibraryStore: @unchecked Sendable {
    public static let shared = LibraryStore()

    private let fileManager = FileManager.default
    private let root: URL
    private let encoder: JSONEncoder = {
        let encoder = JSONEncoder()
        encoder.dateEncodingStrategy = .iso8601
        return encoder
    }()
    private let decoder: JSONDecoder = {
        let decoder = JSONDecoder()
        decoder.dateDecodingStrategy = .iso8601
        return decoder
    }()

    public init(root: URL? = nil) {
        if let root {
            self.root = root
        } else {
            let support = FileManager.default.urls(for: .applicationSupportDirectory, in: .userDomainMask)[0]
            self.root = support.appendingPathComponent("Library", isDirectory: true)
        }
        try? fileManager.createDirectory(at: booksDirectory, withIntermediateDirectories: true)
    }

    private var indexURL: URL { root.appendingPathComponent("index.json") }
    private var settingsURL: URL { root.appendingPathComponent("settings.json") }
    private var booksDirectory: URL { root.appendingPathComponent("Books", isDirectory: true) }

    public func directory(for id: UUID) -> URL {
        booksDirectory.appendingPathComponent(id.uuidString, isDirectory: true)
    }

    public func sourceURL(for id: UUID) -> URL {
        directory(for: id).appendingPathComponent("source.pdf")
    }

    // MARK: - Library

    public func books() -> [BookSummary] {
        let all: [BookSummary] = (try? read([BookSummary].self, from: indexURL)) ?? []
        return all.sorted { $0.addedAt > $1.addedAt }
    }

    /// Writes a freshly ingested book and copies the PDF alongside it.
    @discardableResult
    public func add(_ book: IngestedBook, source: URL, id: UUID = UUID()) throws -> BookSummary {
        let directory = directory(for: id)
        try fileManager.createDirectory(at: directory, withIntermediateDirectories: true)

        let destination = sourceURL(for: id)
        if fileManager.fileExists(atPath: destination.path) {
            try fileManager.removeItem(at: destination)
        }
        try fileManager.copyItem(at: source, to: destination)

        try write(
            BookContents(chunks: book.chunks, chapters: book.chapters, stats: book.stats),
            to: directory.appendingPathComponent("contents.json")
        )

        let summary = BookSummary(
            id: id,
            title: book.title,
            author: book.author,
            pageCount: book.pageCount,
            wordCount: book.wordCount,
            chunkCount: book.chunks.count
        )
        var index = books().filter { $0.id != id }
        index.append(summary)
        try write(index, to: indexURL)
        return summary
    }

    public func contents(for id: UUID) throws -> BookContents {
        try read(BookContents.self, from: directory(for: id).appendingPathComponent("contents.json"))
    }

    public func delete(_ id: UUID) throws {
        try? fileManager.removeItem(at: directory(for: id))
        try write(books().filter { $0.id != id }, to: indexURL)
    }

    // MARK: - Position

    public func position(for id: UUID) -> ReadingPosition? {
        try? read(ReadingPosition.self, from: directory(for: id).appendingPathComponent("position.json"))
    }

    public func save(_ position: ReadingPosition, for id: UUID) {
        try? write(position, to: directory(for: id).appendingPathComponent("position.json"))
    }

    // MARK: - Bookmarks

    public func bookmarks(for id: UUID) -> [Bookmark] {
        let all: [Bookmark] = (try? read(
            [Bookmark].self,
            from: directory(for: id).appendingPathComponent("bookmarks.json")
        )) ?? []
        return all.sorted {
            $0.chunkIndex == $1.chunkIndex ? $0.tokenIndex < $1.tokenIndex : $0.chunkIndex < $1.chunkIndex
        }
    }

    public func add(_ bookmark: Bookmark, to id: UUID) {
        var all = bookmarks(for: id)
        all.append(bookmark)
        try? write(all, to: directory(for: id).appendingPathComponent("bookmarks.json"))
    }

    public func removeBookmark(_ bookmarkID: UUID, from id: UUID) {
        let all = bookmarks(for: id).filter { $0.id != bookmarkID }
        try? write(all, to: directory(for: id).appendingPathComponent("bookmarks.json"))
    }

    // MARK: - Settings

    public func settings() -> AppSettings {
        (try? read(AppSettings.self, from: settingsURL)) ?? .default
    }

    public func save(_ settings: AppSettings) {
        try? write(settings, to: settingsURL)
    }

    // MARK: - Files

    private func read<T: Decodable>(_ type: T.Type, from url: URL) throws -> T {
        let data = try Data(contentsOf: url)
        return try decoder.decode(type, from: data)
    }

    private func write<T: Encodable>(_ value: T, to url: URL) throws {
        try fileManager.createDirectory(
            at: url.deletingLastPathComponent(),
            withIntermediateDirectories: true
        )
        try encoder.encode(value).write(to: url, options: .atomic)
    }
}
