import XCTest
@testable import AudiobookReader

/// Ported from `src/lib/pdf/lines.test.ts`.
final class LinesTests: XCTestCase {
    private func run(_ text: String, _ x: Double, _ y: Double, _ width: Double, size: Double = 10) -> TextRun {
        TextRun(text: text, x0: x, x1: x + width, y: y, fontSize: size)
    }

    func testJoinsRunsSharingABaselineAndInsertsSpacesAcrossGaps() {
        let lines = groupIntoLines([run("Hello", 72, 700, 30), run("world", 105, 700, 30)], page: 1)
        XCTAssertEqual(lines.count, 1)
        XCTAssertEqual(lines[0].text, "Hello world")
        XCTAssertEqual(lines[0].x1, 135, accuracy: 0.0001)
    }

    func testDoesNotInsertASpaceBetweenRunsThatTouch() {
        let lines = groupIntoLines([run("Wins", 72, 700, 20), run("ton", 92, 700, 15)], page: 1)
        XCTAssertEqual(lines[0].text, "Winston")
    }

    func testSplitsAtAColumnGutterOnTheSameBaseline() {
        let lines = groupIntoLines(
            [run("left column text", 60, 700, 220), run("right column text", 320, 700, 220)],
            page: 1
        )
        XCTAssertEqual(lines.map(\.text), ["left column text", "right column text"])
    }

    func testOrdersLinesFromTheTopOfThePageDown() {
        let lines = groupIntoLines([run("second", 72, 680, 40), run("first", 72, 700, 40)], page: 1)
        XCTAssertEqual(lines.map(\.text), ["first", "second"])
    }
}
