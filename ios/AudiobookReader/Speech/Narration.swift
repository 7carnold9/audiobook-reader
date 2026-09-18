import Foundation

/// Silences a narrator actually leaves, in seconds.
///
/// Chunks are a synthesis detail, not a unit of speech. What a listener hears as
/// a beat is the end of a sentence, a paragraph, or a heading — so those are the
/// only places the narration stops, and everything else runs on.
public enum NarrationPauses {
    public static let sentence: TimeInterval = 0.220
    public static let paragraph: TimeInterval = 0.460
    public static let beforeHeading: TimeInterval = 0.900
    public static let afterHeading: TimeInterval = 0.650
}

/// Headings are read slightly slower than body text, the way a narrator marks them.
public let headingRate: Double = 0.94

/// How many utterances may sit queued ahead of the one being spoken.
private let lookahead = 3

/// One utterance: a sentence, or the tail of one split across chunks.
public struct SpeechUnit: Equatable, Sendable {
    public var text: String
    /// Index of this unit's first word among the chunk's display tokens.
    public var tokenStart: Int
    public var tokenCount: Int
    /// False for a fragment that runs into the next unit, which must not be broken.
    public var endsSentence: Bool

    public init(text: String, tokenStart: Int, tokenCount: Int, endsSentence: Bool) {
        self.text = text
        self.tokenStart = tokenStart
        self.tokenCount = tokenCount
        self.endsSentence = endsSentence
    }
}

/// Splits a chunk into the sentences it will be spoken as.
public func speechUnits(_ text: String) -> [SpeechUnit] {
    var units: [SpeechUnit] = []
    var tokenStart = 0
    for sentence in splitSentences(text) {
        let tokenCount = Scan.words(sentence).count
        guard tokenCount > 0 else { continue }
        units.append(
            SpeechUnit(
                text: sentence,
                tokenStart: tokenStart,
                tokenCount: tokenCount,
                endsSentence: Scan.endsSpokenSentence(sentence)
            )
        )
        tokenStart += tokenCount
    }
    return units
}

/// The structural silence owed before `chunk`: paragraph and heading beats only.
public func pauseBefore(_ chunk: Chunk?, previous: Chunk?) -> TimeInterval {
    guard let chunk, let previous else { return 0 }
    if chunk.isHeading { return NarrationPauses.beforeHeading }
    if previous.isHeading { return NarrationPauses.afterHeading }
    if chunk.startsParagraph { return NarrationPauses.paragraph }
    return 0
}

public func rateFor(_ chunk: Chunk, rate: Double) -> Double {
    chunk.isHeading ? rate * headingRate : rate
}

// MARK: - Scheduling seam

public protocol NarrationTimer: AnyObject {
    func cancel()
}

/// Where the timed silences come from. Injected so the schedule can be tested
/// without waiting a real 900 milliseconds for a heading.
public protocol NarrationScheduler {
    func schedule(after delay: TimeInterval, _ work: @escaping () -> Void) -> NarrationTimer
}

public struct MainQueueScheduler: NarrationScheduler {
    public init() {}

    private final class Token: NarrationTimer {
        let item: DispatchWorkItem
        init(_ item: DispatchWorkItem) { self.item = item }
        func cancel() { item.cancel() }
    }

    public func schedule(after delay: TimeInterval, _ work: @escaping () -> Void) -> NarrationTimer {
        let item = DispatchWorkItem(block: work)
        DispatchQueue.main.asyncAfter(deadline: .now() + delay, execute: item)
        return Token(item)
    }
}

// MARK: - Narration

public struct NarrationCallbacks {
    public var onIndex: (Int) -> Void
    public var onToken: (Int) -> Void
    public var onError: (String) -> Void
    public var onFinished: () -> Void

    public init(
        onIndex: @escaping (Int) -> Void,
        onToken: @escaping (Int) -> Void,
        onError: @escaping (String) -> Void,
        onFinished: @escaping () -> Void
    ) {
        self.onIndex = onIndex
        self.onToken = onToken
        self.onError = onError
        self.onFinished = onFinished
    }
}

public struct NarrationOptions {
    public var provider: SpeechProvider
    public var chunks: [Chunk]
    public var bookID: String
    public var voiceID: String?
    public var rate: Double
    public var callbacks: NarrationCallbacks
    public var scheduler: NarrationScheduler

    public init(
        provider: SpeechProvider,
        chunks: [Chunk],
        bookID: String,
        voiceID: String?,
        rate: Double,
        callbacks: NarrationCallbacks,
        scheduler: NarrationScheduler = MainQueueScheduler()
    ) {
        self.provider = provider
        self.chunks = chunks
        self.bookID = bookID
        self.voiceID = voiceID
        self.rate = rate
        self.callbacks = callbacks
        self.scheduler = scheduler
    }
}

/// Drives continuous narration over a book's chunks.
///
/// Speech is scheduled one sentence at a time. Where a sentence runs into the
/// next unit — a long sentence split across chunks — the continuation is handed
/// to the engine before the current one ends, so it plays straight through with
/// no seam. Everywhere else the silence is deliberate and timed.
///
/// Not thread-safe: drive it from the main thread, which is where the
/// synthesizer delegate callbacks are re-dispatched to.
public final class Narration {
    /// A point in the book: a chunk, and a sentence within it.
    struct Position: Hashable {
        var chunk: Int
        var unit: Int
    }

    private let options: NarrationOptions
    private var handles: [Position: SpeechHandle] = [:]
    private var queued: Set<Position> = []
    private var timer: NarrationTimer?
    private var unitCache: [Int: [SpeechUnit]] = [:]
    private var speaking: Position?
    private var start = Position(chunk: 0, unit: 0)
    private var startWithinUnit = 0
    private var isPaused = false
    private var isStopped = false
    /// Where to pick up from when a pause lands during a silence.
    private var pending: Position?

    public init(_ options: NarrationOptions) {
        self.options = options
    }

    /// Begins at chunk `from`, optionally partway through it: `fromToken` is a
    /// display token index, so a reader can tap a word and be read to from that
    /// word rather than from the top of the chunk.
    public func begin(from: Int, fromToken: Int = 0) {
        isStopped = false
        speaking = nil
        pending = nil
        queued.removeAll()

        let units = unitsFor(from)
        let token = max(0, fromToken)
        let unit = units.firstIndex { token < $0.tokenStart + $0.tokenCount }
        start = Position(chunk: from, unit: unit ?? max(0, units.count - 1))
        startWithinUnit = unit.map { max(0, token - units[$0].tokenStart) } ?? 0

        speak(start, append: false, delay: 0, depth: 0)
    }

    public func stop() {
        isStopped = true
        clearTimer()
        for handle in handles.values { handle.stop() }
        handles.removeAll()
        queued.removeAll()
        speaking = nil
        pending = nil
    }

    public func pause() {
        isPaused = true
        for handle in handles.values { handle.pause() }
    }

    public func resume() {
        isPaused = false
        for handle in handles.values { handle.resume() }
        // A pause during a silence has nothing to resume, so the next utterance
        // was held back instead of being started and immediately paused.
        let held = pending
        pending = nil
        if let held { speak(held, append: false, delay: 0, depth: 0) }
    }

    // MARK: - Schedule

    private func unitsFor(_ chunkIndex: Int) -> [SpeechUnit] {
        if let cached = unitCache[chunkIndex] { return cached }
        let units = options.chunks.indices.contains(chunkIndex)
            ? speechUnits(options.chunks[chunkIndex].text)
            : []
        unitCache[chunkIndex] = units
        return units
    }

    private func next(after position: Position) -> Position? {
        if position.unit + 1 < unitsFor(position.chunk).count {
            return Position(chunk: position.chunk, unit: position.unit + 1)
        }
        let chunk = position.chunk + 1
        return options.chunks.indices.contains(chunk) ? Position(chunk: chunk, unit: 0) : nil
    }

    /// Silence owed before `position`, given the unit that precedes it.
    private func pauseAt(_ position: Position, previous: Position) -> TimeInterval {
        let chunks = options.chunks
        if position.chunk != previous.chunk {
            let structural = pauseBefore(
                chunks.indices.contains(position.chunk) ? chunks[position.chunk] : nil,
                previous: chunks.indices.contains(previous.chunk) ? chunks[previous.chunk] : nil
            )
            if structural > 0 { return structural }
        }
        let units = unitsFor(previous.chunk)
        let previousUnit = units.indices.contains(previous.unit) ? units[previous.unit] : nil
        // A sentence split across chunks must not be broken mid-clause.
        return previousUnit?.endsSentence == true ? NarrationPauses.sentence : 0
    }

    private func speak(_ position: Position, append: Bool, delay: TimeInterval, depth: Int) {
        guard options.chunks.indices.contains(position.chunk) else {
            options.callbacks.onFinished()
            return
        }
        let chunk = options.chunks[position.chunk]

        let units = unitsFor(position.chunk)
        guard units.indices.contains(position.unit) else {
            if let following = next(after: position) {
                speak(following, append: append, delay: delay, depth: depth)
            } else {
                options.callbacks.onFinished()
            }
            return
        }
        let unit = units[position.unit]

        let within = position == start ? startWithinUnit : 0
        let whole = toSpeech(unit.text)
        let speech = within > 0
            ? toSpeech(whole.tokens.dropFirst(within).joined(separator: " "))
            : whole

        guard !speech.text.isEmpty else {
            // Nothing speakable here: a stray citation or a bullet glyph.
            if let following = next(after: position) {
                speak(following, append: append, delay: delay, depth: depth)
            } else {
                options.callbacks.onFinished()
            }
            return
        }

        let tokenOffset = unit.tokenStart + within
        queued.insert(position)

        let request = SpeechRequest(
            text: speech.text,
            rate: rateFor(chunk, rate: options.rate),
            voiceID: options.voiceID,
            append: append,
            preDelay: options.provider.honoursDelays ? delay : 0,
            cacheKey: "\(options.bookID):\(chunk.index):\(unit.tokenStart)",
            onStart: { [weak self] in
                guard let self, !self.isStopped else { return }
                self.speaking = position
                self.options.callbacks.onToken(tokenOffset)
                self.options.callbacks.onIndex(position.chunk)
            },
            onBoundary: { [weak self] characterIndex in
                guard let self, !self.isStopped, self.speaking == position else { return }
                let token = tokenAtOffset(speech, characterIndex)
                self.options.callbacks.onToken(token < 0 ? tokenOffset : tokenOffset + token)
            },
            onEnd: { [weak self] error in
                guard let self, !self.isStopped else { return }
                self.handles.removeValue(forKey: position)
                self.queued.remove(position)
                if let error {
                    self.options.callbacks.onError(error.localizedDescription)
                    return
                }
                self.afterUnit(position)
            }
        )

        let handle = options.provider.speak(request)
        handles[position] = handle
        if isPaused { handle.pause() }

        queueContinuation(from: position, depth: depth)
    }

    /// Queues what follows when the engine can play it without a seam.
    ///
    /// With a provider that renders its own delays the beat travels with the
    /// utterance, so even a paragraph break can be queued ahead; otherwise only
    /// a continuation with no silence in front of it may be.
    private func queueContinuation(from: Position, depth: Int) {
        guard options.provider.supportsQueueing, depth < lookahead else { return }
        guard let following = next(after: from), !queued.contains(following) else { return }
        let gap = pauseAt(following, previous: from)
        if gap > 0 && !options.provider.honoursDelays { return }
        speak(following, append: true, delay: gap, depth: depth + 1)
    }

    private func afterUnit(_ position: Position) {
        guard let following = next(after: position) else {
            options.callbacks.onFinished()
            return
        }

        let gap = pauseAt(following, previous: position)
        if queued.contains(following) && (gap == 0 || options.provider.honoursDelays) {
            // Already playing straight on; just keep the queue topped up.
            queueContinuation(from: following, depth: queued.count)
            return
        }

        clearTimer()
        timer = options.scheduler.schedule(after: gap) { [weak self] in
            guard let self else { return }
            self.timer = nil
            guard !self.isStopped else { return }
            // Never start speaking while paused: the new utterance would ignore
            // the pause and carry on by itself.
            if self.isPaused {
                self.pending = following
            } else {
                self.speak(following, append: false, delay: 0, depth: 0)
            }
        }
    }

    private func clearTimer() {
        timer?.cancel()
        timer = nil
    }
}
