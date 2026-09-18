import XCTest
@testable import AudiobookReader

/// Ported from `src/lib/pdf/chapters.test.ts`.
final class ChaptersTests: XCTestCase {
    private func chunk(_ index: Int, _ page: Int, _ text: String, heading: Bool = false) -> Chunk {
        Chunk(index: index, text: text, page: page, paragraph: index, startsParagraph: true, isHeading: heading)
    }

    private lazy var chunks: [Chunk] = [
        chunk(0, 1, "Front matter about the publisher."),
        chunk(1, 3, "Chapter One", heading: true),
        chunk(2, 3, "It was a bright cold day in April."),
        chunk(3, 9, "Chapter Two", heading: true),
        chunk(4, 9, "Outside the world looked cold."),
    ]

    func testPrefersThePDFOutlineAndAnchorsEachEntryToItsPage() {
        let outline = [
            OutlineEntry(title: "Chapter One", page: 3, level: 0),
            OutlineEntry(title: "Chapter Two", page: 9, level: 0),
        ]
        XCTAssertEqual(
            buildChapters(chunks: chunks, outline: outline),
            [
                Chapter(title: "Beginning", chunkIndex: 0, page: 1, level: 0),
                Chapter(title: "Chapter One", chunkIndex: 1, page: 3, level: 0),
                Chapter(title: "Chapter Two", chunkIndex: 3, page: 9, level: 0),
            ]
        )
    }

    func testFallsBackToDetectedHeadingsWhenThereIsNoOutline() {
        XCTAssertEqual(
            buildChapters(chunks: chunks, outline: []).map(\.title),
            ["Beginning", "Chapter One", "Chapter Two"]
        )
    }

    func testIgnoresOutlineEntriesWhoseDestinationCouldNotBeResolved() {
        let outline = [
            OutlineEntry(title: "Chapter One", page: nil, level: 0),
            OutlineEntry(title: "Chapter Two", page: nil, level: 0),
        ]
        // Nothing usable in the outline, so headings are used instead.
        XCTAssertEqual(buildChapters(chunks: chunks, outline: outline).count, 3)
    }

    func testReturnsNothingForAnEmptyBook() {
        XCTAssertTrue(buildChapters(chunks: [], outline: []).isEmpty)
    }
}
