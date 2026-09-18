import XCTest
@testable import AudiobookReader

/// Ported from `src/lib/pdf/chunk.test.ts`.
final class ChunkerTests: XCTestCase {
    func testSplitsOnSentenceEnds() {
        XCTAssertEqual(
            splitSentences("One thing happened. Then another! And a third?"),
            ["One thing happened.", "Then another!", "And a third?"]
        )
    }

    func testDoesNotSplitOnAbbreviationsInitialsOrDecimals() {
        XCTAssertEqual(splitSentences("See Fig. 2 for details."), ["See Fig. 2 for details."])
        XCTAssertEqual(
            splitSentences("Written by J. R. R. Tolkien in 1937."),
            ["Written by J. R. R. Tolkien in 1937."]
        )
        XCTAssertEqual(
            splitSentences("Version 2.1 shipped. It was late."),
            ["Version 2.1 shipped.", "It was late."]
        )
        XCTAssertEqual(
            splitSentences("Reported by Chen et al. in a later paper."),
            ["Reported by Chen et al. in a later paper."]
        )
    }

    func testKeepsClosingQuotesWithTheSentenceTheyEnd() {
        XCTAssertEqual(splitSentences("\"Go away.\" She left."), ["\"Go away.\"", "She left."])
    }

    // MARK: chunkParagraphs

    private func paragraph(_ text: String, page: Int = 1, heading: Bool = false) -> Paragraph {
        Paragraph(text: text, page: page, isHeading: heading)
    }

    func testKeepsShortParagraphsWholeAndNumbersChunksSequentially() {
        let chunks = chunkParagraphs([paragraph("First one."), paragraph("Second one.", page: 2)])
        XCTAssertEqual(chunks.map(\.index), [0, 1])
        XCTAssertEqual(chunks.map(\.text), ["First one.", "Second one."])
        XCTAssertEqual(chunks.map(\.page), [1, 2])
        XCTAssertTrue(chunks.allSatisfy(\.startsParagraph))
    }

    func testSplitsALongParagraphAtSentenceBoundaries() {
        let sentence = "The quick brown fox jumped over the lazy dog and kept on running. "
        let full = String(repeating: sentence, count: 12)
            .trimmingCharacters(in: .whitespaces)
        let chunks = chunkParagraphs([paragraph(full)])

        XCTAssertGreaterThan(chunks.count, 1)
        XCTAssertTrue(chunks.allSatisfy { $0.text.count <= 480 })
        XCTAssertTrue(chunks.allSatisfy { $0.text.hasSuffix("running.") })
        XCTAssertTrue(chunks[0].startsParagraph)
        XCTAssertFalse(chunks[1].startsParagraph)
        // Nothing is lost in the split.
        XCTAssertEqual(chunks.map(\.text).joined(separator: " "), full)
    }

    func testSplitsASentenceLongerThanTheHardLimit() {
        let monster = String(repeating: "word ", count: 200).trimmingCharacters(in: .whitespaces) + "."
        let chunks = chunkParagraphs([paragraph(monster)])
        XCTAssertGreaterThan(chunks.count, 1)
        XCTAssertTrue(chunks.allSatisfy { $0.text.count <= 480 })
    }

    func testNeverSplitsAHeading() {
        let chunks = chunkParagraphs([paragraph("Chapter One. The Beginning.", page: 1, heading: true)])
        XCTAssertEqual(chunks.count, 1)
        XCTAssertTrue(chunks[0].isHeading)
    }
}
