import Foundation

/// What the library list needs to draw a row, and nothing more. The chunks live
/// in a separate file so opening the shelf does not decode a whole book.
public struct BookSummary: Codable, Identifiable, Hashable, Sendable {
    public var id: UUID
    public var title: String
    public var author: String?
    public var pageCount: Int
    public var wordCount: Int
    /// Kept here so the shelf can show progress without decoding the book.
    public var chunkCount: Int
    public var addedAt: Date

    public init(
        id: UUID = UUID(),
        title: String,
        author: String?,
        pageCount: Int,
        wordCount: Int,
        chunkCount: Int,
        addedAt: Date = Date()
    ) {
        self.id = id
        self.title = title
        self.author = author
        self.pageCount = pageCount
        self.wordCount = wordCount
        self.chunkCount = chunkCount
        self.addedAt = addedAt
    }
}

public struct BookContents: Codable, Equatable, Sendable {
    public var chunks: [Chunk]
    public var chapters: [Chapter]
    public var stats: CleanStats

    public init(chunks: [Chunk], chapters: [Chapter], stats: CleanStats) {
        self.chunks = chunks
        self.chapters = chapters
        self.stats = stats
    }
}

public struct ReadingPosition: Codable, Equatable, Sendable {
    public var chunkIndex: Int
    /// Word within the chunk, so resuming lands on the right sentence.
    public var tokenIndex: Int
    public var updatedAt: Date

    public init(chunkIndex: Int, tokenIndex: Int = 0, updatedAt: Date = Date()) {
        self.chunkIndex = chunkIndex
        self.tokenIndex = tokenIndex
        self.updatedAt = updatedAt
    }
}

public struct Bookmark: Codable, Identifiable, Equatable, Sendable {
    public var id: UUID
    public var chunkIndex: Int
    /// Word within the chunk, so a bookmark returns to the exact spot.
    public var tokenIndex: Int
    public var page: Int
    /// A few words of the passage, so the list is readable.
    public var excerpt: String
    public var createdAt: Date

    public init(
        id: UUID = UUID(),
        chunkIndex: Int,
        tokenIndex: Int,
        page: Int,
        excerpt: String,
        createdAt: Date = Date()
    ) {
        self.id = id
        self.chunkIndex = chunkIndex
        self.tokenIndex = tokenIndex
        self.page = page
        self.excerpt = excerpt
        self.createdAt = createdAt
    }
}

public struct AppSettings: Codable, Equatable, Sendable {
    public var voiceID: String?
    public var favouriteVoiceIDs: [String]
    public var rate: Double

    public init(voiceID: String? = nil, favouriteVoiceIDs: [String] = [], rate: Double = 1) {
        self.voiceID = voiceID
        self.favouriteVoiceIDs = favouriteVoiceIDs
        self.rate = rate
    }

    public static let `default` = AppSettings()
}
