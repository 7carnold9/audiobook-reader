import Foundation
import Observation

/// The reader's playback state, wrapped around `Narration`, which owns the
/// actual sequencing.
///
/// Playback is *engaged* separately from *paused* so that pausing can use the
/// engine's own pause instead of tearing down the utterance, which would lose
/// the position inside the current sentence. Seeking, and any change of rate or
/// voice, restarts narration from the current chunk.
@MainActor
@Observable
public final class PlayerModel {
    public enum Status: Equatable {
        case idle, playing, paused, ended
    }

    public private(set) var status: Status = .idle
    /// Chunk currently being spoken.
    public private(set) var index: Int
    /// Display-token index within the current chunk, or -1 when unknown.
    public private(set) var tokenIndex: Int = -1
    public private(set) var errorMessage: String?
    public private(set) var rate: Double
    public private(set) var voiceID: String?

    public let chunks: [Chunk]
    public let bookID: String

    /// Called whenever the spoken position moves, for persistence.
    public var onPositionChange: ((Int, Int) -> Void)?
    /// Called when the book finishes or the position changes, for the lock screen.
    public var onNowPlayingChange: (() -> Void)?

    private let provider: SpeechProvider
    private let timeline: Timeline
    private var narration: Narration?
    /// The word within `index` to begin at; consumed by the next start.
    private var pendingToken = 0

    public init(
        bookID: String,
        chunks: [Chunk],
        provider: SpeechProvider,
        voiceID: String?,
        startIndex: Int = 0,
        startToken: Int = 0,
        rate: Double = 1
    ) {
        self.bookID = bookID
        self.chunks = chunks
        self.provider = provider
        self.voiceID = voiceID
        self.index = max(0, min(chunks.count - 1, startIndex))
        self.pendingToken = max(0, startToken)
        self.tokenIndex = startToken > 0 ? startToken : -1
        self.rate = rate
        self.timeline = buildTimeline(chunks)
    }

    // MARK: - Transport

    public func play() {
        errorMessage = nil
        if status == .paused, let narration {
            status = .playing
            narration.resume()
            onNowPlayingChange?()
            return
        }
        status = .playing
        engage()
        onNowPlayingChange?()
    }

    public func pause() {
        guard status == .playing else { return }
        status = .paused
        narration?.pause()
        onNowPlayingChange?()
    }

    /// Ends the utterance outright, keeping the position.
    public func stop() {
        narration?.stop()
        narration = nil
        status = .idle
        onNowPlayingChange?()
    }

    public func toggle() {
        status == .playing ? pause() : play()
    }

    // MARK: - Seeking

    /// Moves to a chunk, and optionally a word within it, without starting.
    public func seek(toChunk next: Int, token: Int = 0) {
        let clamped = max(0, min(chunks.count - 1, next))
        index = clamped
        pendingToken = max(0, token)
        // Show the chosen word as current straight away, before the engine speaks.
        tokenIndex = token > 0 ? token : -1
        onPositionChange?(clamped, pendingToken)

        if status == .playing || status == .paused {
            engage()
        }
        onNowPlayingChange?()
    }

    /// Jumps to a chunk, optionally to a word within it, and starts reading there.
    public func start(atChunk next: Int, token: Int = 0) {
        errorMessage = nil
        let wasPaused = status == .paused
        status = .playing
        seek(toChunk: next, token: token)
        if wasPaused { narration?.resume() }
    }

    /// The ±15s buttons and the lock-screen skip commands.
    ///
    /// Speech has no real timeline until it has been spoken, so this moves by the
    /// estimate in `Timeline` — the same estimate the scrubber shows.
    public func skip(seconds: TimeInterval) {
        seek(toChunk: chunkAtSeconds(timeline, (elapsed + seconds) * rate))
    }

    public func seek(toSeconds seconds: TimeInterval) {
        seek(toChunk: chunkAtSeconds(timeline, seconds * rate))
    }

    public func setRate(_ next: Double) {
        let clamped = min(3, max(0.5, next))
        guard clamped != rate else { return }
        rate = clamped
        if status == .playing || status == .paused { engage() }
        onNowPlayingChange?()
    }

    public func setVoice(_ next: String?) {
        guard next != voiceID else { return }
        voiceID = next
        if status == .playing || status == .paused { engage() }
    }

    // MARK: - Progress

    public var elapsed: TimeInterval {
        let chunkIndex = min(index, max(chunks.count - 1, 0))
        guard timeline.starts.indices.contains(chunkIndex) else { return timeline.total / rate }
        let tokens = chunks.indices.contains(chunkIndex)
            ? toSpeech(chunks[chunkIndex].text).tokens.count
            : 0
        let within = tokens > 0 && tokenIndex >= 0 ? Double(tokenIndex) / Double(tokens) : 0
        let base = timeline.starts[chunkIndex] + within * (timeline.durations[chunkIndex])
        return base / rate
    }

    public var duration: TimeInterval { timeline.total / rate }

    public var currentChunk: Chunk? {
        chunks.indices.contains(index) ? chunks[index] : nil
    }

    // MARK: - Engine

    private func engage() {
        narration?.stop()

        let wasPaused = status == .paused
        let narration = Narration(
            NarrationOptions(
                provider: provider,
                chunks: chunks,
                bookID: bookID,
                voiceID: voiceID,
                rate: rate,
                callbacks: NarrationCallbacks(
                    onIndex: { [weak self] next in
                        guard let self else { return }
                        self.index = next
                        self.onPositionChange?(next, max(0, self.tokenIndex))
                        self.onNowPlayingChange?()
                    },
                    onToken: { [weak self] token in
                        self?.tokenIndex = token
                    },
                    onError: { [weak self] message in
                        guard let self else { return }
                        self.errorMessage = message
                        self.status = .paused
                        self.onNowPlayingChange?()
                    },
                    onFinished: { [weak self] in
                        guard let self else { return }
                        self.status = .ended
                        self.onNowPlayingChange?()
                    }
                )
            )
        )

        self.narration = narration
        errorMessage = nil
        // A rate or voice change while paused restarts the sentence; keep it paused.
        if wasPaused { narration.pause() }
        narration.begin(from: index, fromToken: pendingToken)
        // The starting word applies to this run only; a later restart (a speed or
        // voice change) begins at the top of whatever chunk is then current.
        pendingToken = 0
    }
}
