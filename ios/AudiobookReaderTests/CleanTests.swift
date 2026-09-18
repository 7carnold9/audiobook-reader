import XCTest
@testable import AudiobookReader

/// Ported from `src/lib/pdf/clean.test.ts`.
final class CleanTests: XCTestCase {
    private let pageHeight: Double = 792
    private let pageWidth: Double = 612

    private func line(
        _ text: String,
        _ y: Double,
        x0: Double = 72,
        x1: Double = 540,
        fontSize: Double = 11,
        page: Int = 1
    ) -> RawLine {
        RawLine(text: text, x0: x0, x1: x1, y: y, fontSize: fontSize, page: page)
    }

    private func page(_ lines: [RawLine], _ number: Int = 1) -> RawPage {
        RawPage(page: number, width: pageWidth, height: pageHeight, lines: lines)
    }

    // MARK: joinLines

    func testRepairsWordsBrokenByAnEndOfLineHyphen() {
        XCTAssertEqual(
            joinLines([line("striking thir-", 700), line("teen. Winston", 685)]),
            "striking thirteen. Winston"
        )
    }

    func testKeepsAHyphenBeforeACapitalisedWord() {
        XCTAssertEqual(
            joinLines([line("the Anglo-", 700), line("French treaty", 685)]),
            "the Anglo- French treaty"
        )
    }

    // MARK: findRepeatedMarginLines

    func testFindsRunningHeadersWhosePageNumberChanges() {
        let pages = (1...5).map { number in
            page(
                [
                    line("NINETEEN EIGHTY-FOUR", pageHeight - 40, x0: 72, x1: 240, fontSize: 9, page: number),
                    line("Body text on the page.", 400, x0: 72, x1: 540, fontSize: 11, page: number),
                    line("Chapter 3 \u{00B7} page \(number)", 30, x0: 72, x1: 240, fontSize: 9, page: number),
                ],
                number
            )
        }
        let repeated = findRepeatedMarginLines(pages)
        XCTAssertTrue(repeated.contains("nineteen eighty-four"))
        XCTAssertTrue(repeated.contains("chapter # \u{00B7} page #"))
    }

    func testDoesNotTreatBodyTextAsAHeader() {
        let pages = (1...3).map { number in
            page([line("Body text", 400, x0: 72, x1: 540, fontSize: 11, page: number)], number)
        }
        XCTAssertTrue(findRepeatedMarginLines(pages).isEmpty)
    }

    // MARK: orderLines

    func testReadsATwoColumnPageColumnByColumn() {
        let left = (0...3).map { line("left \($0)", 700 - Double($0) * 14, x0: 60, x1: 290) }
        let right = (0...3).map { line("right \($0)", 700 - Double($0) * 14, x0: 320, x1: 550) }
        let blocks = orderLines(page(left + right))
        XCTAssertEqual(
            blocks.flatMap { $0.lines.map(\.text) },
            ["left 0", "left 1", "left 2", "left 3", "right 0", "right 1", "right 2", "right 3"]
        )
    }

    func testKeepsAFullWidthLineAboveTheColumnsItPrecedes() {
        let title = line("A Title Spanning Both Columns", 730, x0: 100, x1: 500, fontSize: 17)
        let left = (0...2).map { line("left \($0)", 700 - Double($0) * 14, x0: 60, x1: 290) }
        let right = (0...2).map { line("right \($0)", 700 - Double($0) * 14, x0: 320, x1: 550) }
        let blocks = orderLines(page([title] + left + right))

        XCTAssertEqual(blocks[0].lines[0].text, "A Title Spanning Both Columns")
        let flattened = blocks.flatMap { $0.lines.map(\.text) }
        XCTAssertEqual(Array(flattened[1..<4]), ["left 0", "left 1", "left 2"])
    }

    func testLeavesASingleColumnPageAlone() {
        let lines = (0...5).map { line("line \($0)", 700 - Double($0) * 14) }
        let blocks = orderLines(page(lines))
        XCTAssertEqual(blocks.count, 1)
        XCTAssertEqual(blocks[0].lines.map(\.text), lines.map(\.text))
    }

    // MARK: cleanPages

    func testDropsRepeatedHeadersPageNumbersAndFootnotes() {
        let pages = (1...4).map { number in
            page(
                [
                    line("A Short History of Nearly Everything", pageHeight - 30, x0: 72, x1: 300, fontSize: 9, page: number),
                    line("The body of the page continues here and says something.", 600, x0: 72, x1: 540, fontSize: 11, page: number),
                    line("1 A footnote in smaller type.", 120, x0: 72, x1: 300, fontSize: 7, page: number),
                    line("\(number)", 30, x0: 300, x1: 312, fontSize: 9, page: number),
                ],
                number
            )
        }
        let result = cleanPages(pages)
        let text = result.paragraphs.map(\.text).joined(separator: " ")

        XCTAssertFalse(text.contains("Short History"))
        XCTAssertFalse(text.contains("footnote"))
        XCTAssertTrue(text.contains("body of the page"))
        XCTAssertGreaterThanOrEqual(result.stats.droppedMarginLines, 8)
        XCTAssertEqual(result.stats.droppedFootnoteLines, 4)
    }

    func testStartsANewParagraphAtAnIndentedFirstLine() {
        let pages = [
            page([
                line("The first paragraph runs to the right margin and keeps going.", 700),
                line("It continues on a second line here.", 686),
                line("A new paragraph begins, indented.", 672, x0: 90),
                line("and carries on to this line.", 658),
            ])
        ]
        let result = cleanPages(pages)
        XCTAssertEqual(result.paragraphs.count, 2)
        XCTAssertEqual(
            result.paragraphs[1].text,
            "A new paragraph begins, indented. and carries on to this line."
        )
    }

    func testMarksLargerShortLinesAsHeadings() {
        let pages = [
            page([
                line("Chapter One", 720, x0: 72, x1: 180, fontSize: 16),
                line("The body text of the chapter starts here and runs on.", 690),
                line("It keeps going on a second line.", 676),
            ])
        ]
        let result = cleanPages(pages)
        XCTAssertEqual(result.paragraphs[0].text, "Chapter One")
        XCTAssertTrue(result.paragraphs[0].isHeading)
        XCTAssertFalse(result.paragraphs[1].isHeading)
    }

    func testLetsAParagraphContinueAcrossAPageBreak() {
        let pages = [
            page([line("A sentence that stops mid-thought and", 100)], 1),
            page([line("finishes on the following page.", 700, x0: 72, x1: 300, fontSize: 11, page: 2)], 2),
        ]
        let result = cleanPages(pages)
        XCTAssertEqual(result.paragraphs.count, 1)
        XCTAssertEqual(
            result.paragraphs[0].text,
            "A sentence that stops mid-thought and finishes on the following page."
        )
    }
}
