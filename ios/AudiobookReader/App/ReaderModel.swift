import Foundation
import Observation

/// One open book: its chunks, its player, its bookmarks, and the lock-screen
/// wiring that keeps it talking when the screen goes dark.
@MainActor
@Observable
public final class ReaderModel {
    public let book: BookSummary
    public private(set) var contents: BookContents?
    public private(set) var player: PlayerModel?
    public private(set) var bookmarks: [Bookmark] = []
    public private(set) var loadError: String?

    private let model: AppModel
    private let nowPlaying = NowPlayingController()
    private var hasWiredSession = false

    public init(book: BookSummary, model: AppModel) {
        self.book = book
        self.model = model
    }

    public var chapters: [Chapter] { contents?.chapters ?? [] }
    public var chunks: [Chunk] { contents?.chunks ?? [] }

    public func load() {
        guard contents == nil else { return }
        do {
            let contents = try model.store.contents(for: book.id)
            self.contents = contents
            bookmarks = model.store.bookmarks(for: book.id)

            let position = model.store.position(for: book.id)
            let player = PlayerModel(
                bookID: book.id.uuidString,
                chunks: contents.chunks,
                provider: model.speech,
                voiceID: model.settings.voiceID,
                startIndex: position?.chunkIndex ?? 0,
                startToken: position?.tokenIndex ?? 0,
                rate: model.settings.rate
            )
            player.onPositionChange = { [weak self] chunkIndex, tokenIndex in
                guard let self else { return }
                self.model.store.save(
                    ReadingPosition(chunkIndex: chunkIndex, tokenIndex: tokenIndex),
                    for: self.book.id
                )
            }
            player.onNowPlayingChange = { [weak self] in self?.publishNowPlaying() }
            self.player = player
        } catch {
            loadError = error.localizedDescription
        }
    }

    /// Called when the reader appears. Activating the session here rather than on
    /// the first `play()` means the remote commands are live before the user
    /// reaches for the lock screen.
    public func activate() {
        guard !hasWiredSession else { return }
        hasWiredSession = true

        do {
            try AudioSessionController.shared.activate()
        } catch {
            loadError = "Audio could not start: \(error.localizedDescription)"
        }

        AudioSessionController.shared.onInterruption = { [weak self] shouldResume in
            guard let self, let player = self.player else { return }
            if shouldResume { player.play() } else { player.pause() }
        }
        AudioSessionController.shared.onRouteLoss = { [weak self] in
            self?.player?.pause()
        }

        nowPlaying.wire(
            NowPlayingController.Actions(
                play: { [weak self] in self?.player?.play() },
                pause: { [weak self] in self?.player?.pause() },
                skipForward: { [weak self] in self?.player?.skip(seconds: NowPlayingController.skipInterval) },
                skipBackward: { [weak self] in self?.player?.skip(seconds: -NowPlayingController.skipInterval) },
                nextChapter: { [weak self] in self?.goToChapter(offset: 1) },
                previousChapter: { [weak self] in self?.goToChapter(offset: -1) },
                seek: { [weak self] seconds in self?.player?.seek(toSeconds: seconds) }
            )
        )
        publishNowPlaying()
    }

    public func deactivate() {
        player?.stop()
        nowPlaying.unwire()
        AudioSessionController.shared.deactivate()
        hasWiredSession = false
    }

    // MARK: - Chapters

    public func chapter(at chunkIndex: Int) -> Chapter? {
        chapters.last { $0.chunkIndex <= chunkIndex }
    }

    public func goToChapter(offset: Int) {
        guard let player else { return }
        let current = chapters.lastIndex { $0.chunkIndex <= player.index } ?? 0
        let next = max(0, min(chapters.count - 1, current + offset))
        guard chapters.indices.contains(next) else { return }
        player.start(atChunk: chapters[next].chunkIndex)
    }

    // MARK: - Bookmarks

    public func addBookmark() {
        guard let player, let chunk = player.currentChunk else { return }
        let token = max(0, player.tokenIndex)
        let words = Scan.words(chunk.text)
        let excerpt = words.dropFirst(max(0, token - 2)).prefix(12).joined(separator: " ")
        let bookmark = Bookmark(
            chunkIndex: chunk.index,
            tokenIndex: token,
            page: chunk.page,
            excerpt: excerpt.isEmpty ? String(chunk.text.prefix(80)) : excerpt
        )
        model.store.add(bookmark, to: book.id)
        bookmarks = model.store.bookmarks(for: book.id)
    }

    public func removeBookmark(_ bookmark: Bookmark) {
        model.store.removeBookmark(bookmark.id, from: book.id)
        bookmarks = model.store.bookmarks(for: book.id)
    }

    public func go(to bookmark: Bookmark) {
        player?.start(atChunk: bookmark.chunkIndex, token: bookmark.tokenIndex)
    }

    // MARK: - Settings that outlive the book

    public func setRate(_ rate: Double) {
        player?.setRate(rate)
        model.settings.rate = rate
    }

    public func setVoice(_ voiceID: String?) {
        player?.setVoice(voiceID)
        model.settings.voiceID = voiceID
    }

    // MARK: - Lock screen

    private func publishNowPlaying() {
        guard let player else { return }
        nowPlaying.update(
            title: book.title,
            author: book.author,
            chapter: chapter(at: player.index)?.title,
            elapsed: player.elapsed,
            duration: player.duration,
            rate: player.rate,
            isPlaying: player.status == .playing
        )
    }
}
