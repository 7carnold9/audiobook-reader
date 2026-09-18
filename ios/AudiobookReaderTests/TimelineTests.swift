import XCTest
@testable import AudiobookReader

/// Ported from `src/state/timeline.test.ts`.
final class TimelineTests: XCTestCase {
    private func chunk(_ index: Int, words: Int) -> Chunk {
        Chunk(
            index: index,
            text: Array(repeating: "word", count: words).joined(separator: " "),
            page: 1,
            paragraph: index,
            startsParagraph: true
        )
    }

    func testEstimatesARunningTimeFromTheWordCounts() {
        let timeline = buildTimeline([chunk(0, words: 165), chunk(1, words: 165)])
        // 165 words per minute at 1x, so one minute per chunk.
        XCTAssertEqual(timeline.durations, [60, 60])
        XCTAssertEqual(timeline.starts, [0, 60])
        XCTAssertEqual(timeline.total, 120, accuracy: 0.0001)
    }

    func testHandlesAnEmptyBook() {
        XCTAssertEqual(buildTimeline([]), Timeline(starts: [], durations: [], total: 0))
    }

    func testFindsTheChunkPlayingAtAGivenMoment() {
        let timeline = buildTimeline([chunk(0, words: 165), chunk(1, words: 165), chunk(2, words: 165)])
        XCTAssertEqual(chunkAtSeconds(timeline, 0), 0)
        XCTAssertEqual(chunkAtSeconds(timeline, 59), 0)
        XCTAssertEqual(chunkAtSeconds(timeline, 60), 1)
        XCTAssertEqual(chunkAtSeconds(timeline, 121), 2)
    }

    func testClampsANegativePositionToTheStart() {
        let timeline = buildTimeline([chunk(0, words: 165), chunk(1, words: 165)])
        XCTAssertEqual(chunkAtSeconds(timeline, -10), 0)
    }
}
