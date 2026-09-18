import XCTest
@testable import AudiobookReader

// MARK: - Test doubles

/// A manual clock. The TypeScript suite uses `vi.useFakeTimers()`; on this side
/// the clock is an injected dependency, which is why `NarrationScheduler` exists.
final class TestScheduler: NarrationScheduler {
    private final class Token: NarrationTimer {
        var isCancelled = false
        func cancel() { isCancelled = true }
    }

    private struct Entry {
        var time: TimeInterval
        var token: Token
        var work: () -> Void
    }

    private var pending: [Entry] = []
    private(set) var now: TimeInterval = 0

    func schedule(after delay: TimeInterval, _ work: @escaping () -> Void) -> NarrationTimer {
        let token = Token()
        pending.append(Entry(time: now + delay, token: token, work: work))
        return token
    }

    /// Runs everything due within `interval`, in time order, as a real clock would.
    func advance(by interval: TimeInterval) {
        let target = now + interval
        while true {
            pending.removeAll { $0.token.isCancelled }
            let due = pending.enumerated()
                .filter { $0.element.time <= target + 1e-9 }
                .min { $0.element.time < $1.element.time }
            guard let due else {
                now = target
                return
            }
            let entry = pending.remove(at: due.offset)
            now = entry.time
            entry.work()
        }
    }
}

struct EngineError: LocalizedError {
    let message: String
    var errorDescription: String? { message }
}

/// A stand-in engine: records what it was asked to say, and when.
final class FakeProvider: SpeechProvider {
    let id = "fake"
    let name = "Fake"
    let supportsBoundaries = true
    let supportsQueueing: Bool
    let honoursDelays: Bool
    var isAvailable: Bool { true }

    private(set) var spoken: [SpeechRequest] = []
    private(set) var stopped: [String] = []

    init(supportsQueueing: Bool = true, honoursDelays: Bool = false) {
        self.supportsQueueing = supportsQueueing
        self.honoursDelays = honoursDelays
    }

    func voices() async -> [Voice] { [] }

    private final class Handle: SpeechHandle {
        let text: String
        weak var provider: FakeProvider?
        init(text: String, provider: FakeProvider) {
            self.text = text
            self.provider = provider
        }
        func stop() { provider?.stopped.append(text) }
        func pause() {}
        func resume() {}
    }

    @discardableResult
    func speak(_ request: SpeechRequest) -> SpeechHandle {
        spoken.append(request)
        return Handle(text: request.text, provider: self)
    }

    var texts: [String] { spoken.map(\.text) }

    /// Plays the utterance at `position` through to its end.
    func run(_ position: Int) {
        spoken[position].onStart?()
        spoken[position].onEnd(nil)
    }
}

/// Records what the player would have been told.
final class RecordingCallbacks {
    var indices: [Int] = []
    var tokens: [Int] = []
    var errors: [String] = []
    var finishedCount = 0

    var callbacks: NarrationCallbacks {
        NarrationCallbacks(
            onIndex: { [weak self] in self?.indices.append($0) },
            onToken: { [weak self] in self?.tokens.append($0) },
            onError: { [weak self] in self?.errors.append($0) },
            onFinished: { [weak self] in self?.finishedCount += 1 }
        )
    }
}

// MARK: - Pure schedule

/// Ported from `src/state/narration.test.ts`.
final class SpeechUnitTests: XCTestCase {
    func testSplitsAChunkIntoSentencesAndTracksWhereEachStarts() {
        XCTAssertEqual(
            speechUnits("It was cold. The clocks struck thirteen."),
            [
                SpeechUnit(text: "It was cold.", tokenStart: 0, tokenCount: 3, endsSentence: true),
                SpeechUnit(text: "The clocks struck thirteen.", tokenStart: 3, tokenCount: 4, endsSentence: true),
            ]
        )
    }

    func testMarksAFragmentThatRunsIntoTheNextChunk() {
        let units = speechUnits("Winston slipped through the glass doors")
        XCTAssertEqual(units.count, 1)
        XCTAssertFalse(units[0].endsSentence)
    }
}

final class PauseTests: XCTestCase {
    private func chunk(
        _ index: Int,
        _ text: String,
        startsParagraph: Bool = false,
        heading: Bool = false
    ) -> Chunk {
        Chunk(
            index: index,
            text: text,
            page: 1,
            paragraph: 0,
            startsParagraph: startsParagraph,
            isHeading: heading
        )
    }

    func testLeavesStructuralBeatsToParagraphsAndHeadings() {
        let body = chunk(0, "Body text.")
        XCTAssertEqual(pauseBefore(chunk(1, "More."), previous: body), 0)
        XCTAssertEqual(
            pauseBefore(chunk(1, "New.", startsParagraph: true), previous: body),
            NarrationPauses.paragraph
        )
        let heading = chunk(1, "Chapter Two", startsParagraph: true, heading: true)
        XCTAssertEqual(pauseBefore(heading, previous: body), NarrationPauses.beforeHeading)
        XCTAssertEqual(
            pauseBefore(chunk(2, "After.", startsParagraph: true), previous: heading),
            NarrationPauses.afterHeading
        )
    }

    func testDoesNotPauseBeforeTheVeryFirstChunk() {
        XCTAssertEqual(pauseBefore(chunk(0, "Body text."), previous: nil), 0)
    }

    func testSlowsHeadingsOnly() {
        XCTAssertEqual(rateFor(chunk(0, "Chapter", heading: true), rate: 1), headingRate, accuracy: 0.0001)
        XCTAssertEqual(rateFor(chunk(0, "Body"), rate: 1.5), 1.5, accuracy: 0.0001)
    }
}

// MARK: - The schedule end to end

final class NarrationTests: XCTestCase {
    private func chunk(
        _ index: Int,
        _ text: String,
        startsParagraph: Bool = false,
        heading: Bool = false
    ) -> Chunk {
        Chunk(
            index: index,
            text: text,
            page: 1,
            paragraph: 0,
            startsParagraph: startsParagraph,
            isHeading: heading
        )
    }

    private lazy var chunks: [Chunk] = [
        // Two sentences in one chunk.
        chunk(0, "It was a bright cold day. The clocks were striking thirteen.", startsParagraph: true),
        // A sentence split across a chunk boundary: chunk 1 does not end one.
        chunk(1, "Winston Smith slipped quickly through"),
        chunk(2, "the glass doors of Victory Mansions."),
        chunk(3, "A new paragraph begins here.", startsParagraph: true),
        chunk(4, "Chapter Two", startsParagraph: true, heading: true),
    ]

    private func narrate(
        _ engine: FakeProvider,
        _ scheduler: TestScheduler,
        _ recorder: RecordingCallbacks = RecordingCallbacks(),
        chunks: [Chunk]? = nil
    ) -> Narration {
        Narration(
            NarrationOptions(
                provider: engine,
                chunks: chunks ?? self.chunks,
                bookID: "book",
                voiceID: nil,
                rate: 1,
                callbacks: recorder.callbacks,
                scheduler: scheduler
            )
        )
    }

    func testSpeaksOneSentenceAtATime() {
        let engine = FakeProvider()
        narrate(engine, TestScheduler()).begin(from: 0)
        XCTAssertEqual(engine.texts.first, "It was a bright cold day.")
    }

    func testLeavesABeatBetweenSentences() {
        let engine = FakeProvider()
        let clock = TestScheduler()
        let narration = narrate(engine, clock)
        narration.begin(from: 0)
        engine.run(0)

        clock.advance(by: NarrationPauses.sentence - 0.001)
        XCTAssertEqual(engine.spoken.count, 1)

        clock.advance(by: 0.001)
        XCTAssertEqual(engine.texts[1], "The clocks were striking thirteen.")
        XCTAssertFalse(engine.spoken[1].append)
    }

    func testNeverBreaksASentenceThatRunsAcrossChunks() {
        let engine = FakeProvider()
        narrate(engine, TestScheduler()).begin(from: 1)

        // The continuation is queued ahead so the engine plays straight through.
        XCTAssertEqual(
            engine.texts,
            ["Winston Smith slipped quickly through", "the glass doors of Victory Mansions."]
        )
        XCTAssertTrue(engine.spoken[1].append)
    }

    func testLeavesALongerBeatAtAParagraphThanBetweenSentences() {
        let engine = FakeProvider()
        let clock = TestScheduler()
        let narration = narrate(engine, clock)
        narration.begin(from: 2)
        engine.run(0)

        clock.advance(by: NarrationPauses.sentence)
        XCTAssertEqual(engine.spoken.count, 1)

        clock.advance(by: NarrationPauses.paragraph - NarrationPauses.sentence)
        XCTAssertEqual(engine.texts[1], "A new paragraph begins here.")
    }

    func testLeavesTheLongestBeatBeforeAHeadingAndReadsItSlower() {
        let engine = FakeProvider()
        let clock = TestScheduler()
        let narration = narrate(engine, clock)
        narration.begin(from: 3)
        engine.run(0)

        clock.advance(by: NarrationPauses.paragraph)
        XCTAssertEqual(engine.spoken.count, 1)

        clock.advance(by: NarrationPauses.beforeHeading - NarrationPauses.paragraph)
        XCTAssertEqual(engine.texts[1], "Chapter Two")
        XCTAssertEqual(engine.spoken[1].rate, headingRate, accuracy: 0.0001)
    }

    func testDoesNotStartSpeakingAgainWhilePaused() {
        let engine = FakeProvider()
        let clock = TestScheduler()
        let narration = narrate(engine, clock)
        narration.begin(from: 0)
        engine.run(0)

        narration.pause()
        clock.advance(by: 5)
        // The next sentence is held back rather than started and paused.
        XCTAssertEqual(engine.spoken.count, 1)

        narration.resume()
        XCTAssertEqual(engine.texts[1], "The clocks were striking thirteen.")
    }

    func testReportsTheChunkAndTheWordBeingSpoken() {
        let engine = FakeProvider()
        let clock = TestScheduler()
        let recorder = RecordingCallbacks()
        let narration = narrate(engine, clock, recorder)
        narration.begin(from: 0)
        engine.spoken[0].onStart?()

        XCTAssertEqual(recorder.indices.last, 0)
        XCTAssertEqual(recorder.tokens.last, 0)

        engine.run(0)
        clock.advance(by: NarrationPauses.sentence)
        engine.spoken[1].onStart?()
        // The second sentence starts at the sixth word of the chunk.
        XCTAssertEqual(recorder.tokens.last, 6)
    }

    func testSpeaksSequentiallyWhenTheEngineCannotQueue() {
        let engine = FakeProvider(supportsQueueing: false)
        let clock = TestScheduler()
        let narration = narrate(engine, clock)
        narration.begin(from: 1)

        XCTAssertEqual(engine.spoken.count, 1)
        engine.run(0)
        clock.advance(by: 0)
        XCTAssertEqual(engine.texts[1], "the glass doors of Victory Mansions.")
    }

    func testReportsTheFinishAfterTheLastChunk() {
        let engine = FakeProvider()
        let recorder = RecordingCallbacks()
        let narration = narrate(engine, TestScheduler(), recorder)
        narration.begin(from: 4)
        engine.run(0)
        XCTAssertEqual(recorder.finishedCount, 1)
    }

    func testSurfacesAnEngineErrorInsteadOfCarryingOn() {
        let engine = FakeProvider()
        let clock = TestScheduler()
        let recorder = RecordingCallbacks()
        let narration = narrate(engine, clock, recorder)
        narration.begin(from: 0)
        engine.spoken[0].onEnd(EngineError(message: "no voices installed"))

        XCTAssertEqual(recorder.errors, ["no voices installed"])
        clock.advance(by: 5)
        XCTAssertEqual(engine.spoken.count, 1)
    }

    func testStopsEverythingIncludingAPendingSilence() {
        let engine = FakeProvider()
        let clock = TestScheduler()
        let recorder = RecordingCallbacks()
        let narration = narrate(engine, clock, recorder)
        narration.begin(from: 0)
        engine.run(0)

        narration.stop()
        clock.advance(by: 5)
        XCTAssertEqual(engine.spoken.count, 1)
        XCTAssertFalse(recorder.indices.contains(1))
    }

    func testCancelsWhatIsStillSpeaking() {
        let engine = FakeProvider()
        let narration = narrate(engine, TestScheduler())
        narration.begin(from: 1)
        engine.spoken[0].onStart?()

        narration.stop()
        // Order is not asserted: Swift dictionaries have no insertion order, and
        // the schedule does not depend on which outstanding handle stops first.
        XCTAssertEqual(
            Set(engine.stopped),
            ["Winston Smith slipped quickly through", "the glass doors of Victory Mansions."]
        )
    }

    func testIgnoresCallbacksThatArriveAfterAStop() {
        let engine = FakeProvider()
        let recorder = RecordingCallbacks()
        let narration = narrate(engine, TestScheduler(), recorder)
        narration.begin(from: 0)
        narration.stop()

        engine.spoken[0].onStart?()
        engine.spoken[0].onBoundary?(0)
        XCTAssertTrue(recorder.indices.isEmpty)
        XCTAssertTrue(recorder.tokens.isEmpty)
    }

    // MARK: Starting from a chosen word

    private var singleChunk: [Chunk] {
        [chunk(0, "It was a bright cold day. The clocks were striking thirteen.", startsParagraph: true)]
    }

    func testStartsInsideTheSentenceHoldingThatWord() {
        let engine = FakeProvider()
        let narration = narrate(engine, TestScheduler(), chunks: singleChunk)
        narration.begin(from: 0, fromToken: 3) // "bright"
        XCTAssertEqual(engine.texts.first, "bright cold day.")
    }

    func testSkipsToTheRightSentenceForAWordLaterInTheChunk() {
        let engine = FakeProvider()
        let narration = narrate(engine, TestScheduler(), chunks: singleChunk)
        narration.begin(from: 0, fromToken: 7) // "clocks"
        XCTAssertEqual(engine.texts.first, "clocks were striking thirteen.")
    }

    func testReportsHighlightPositionsAgainstTheWholeChunk() {
        let engine = FakeProvider()
        let recorder = RecordingCallbacks()
        let narration = narrate(engine, TestScheduler(), recorder, chunks: singleChunk)
        narration.begin(from: 0, fromToken: 3)

        engine.spoken[0].onStart?()
        XCTAssertEqual(recorder.tokens.last, 3)

        engine.spoken[0].onBoundary?("bright ".utf16.count)
        XCTAssertEqual(recorder.tokens.last, 4)
    }

    // MARK: The native-delay path, which has no web equivalent

    func testAProviderThatRendersItsOwnDelaysQueuesTheBeatWithTheUtterance() {
        let engine = FakeProvider(honoursDelays: true)
        let narration = narrate(engine, TestScheduler())
        narration.begin(from: 0)

        // Everything within the lookahead goes to the engine at once; each beat
        // travels with its utterance as `AVSpeechUtterance.preUtteranceDelay`
        // rather than as a timer, so the audio graph never goes idle mid-pause.
        XCTAssertEqual(engine.spoken.count, 4)
        XCTAssertTrue(engine.spoken[1].append)
        XCTAssertEqual(engine.spoken[1].preDelay, NarrationPauses.sentence, accuracy: 0.0001)
        XCTAssertEqual(engine.spoken[0].preDelay, 0, accuracy: 0.0001)
    }

    func testTheNativePathStillNeverQueuesMoreThanTheLookahead() {
        let engine = FakeProvider(honoursDelays: true)
        let narration = narrate(engine, TestScheduler())
        narration.begin(from: 0)
        // One in flight plus three queued ahead of it, and no further — even
        // though every following unit is now queueable.
        XCTAssertEqual(engine.spoken.count, 4)
    }
}
