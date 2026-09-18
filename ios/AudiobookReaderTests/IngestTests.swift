import XCTest
@testable import AudiobookReader

/// Ported from `src/lib/pdf/ingest.test.ts`.
final class IngestTests: XCTestCase {
    func testKeepsARealTitle() {
        XCTAssertEqual(usableTitle("Nineteen Eighty-Four"), "Nineteen Eighty-Four")
    }

    func testRejectsExporterPlaceholdersAndFilenames() {
        XCTAssertNil(usableTitle("untitled"))
        XCTAssertNil(usableTitle("Microsoft Word - draft3.doc"))
        XCTAssertNil(usableTitle("report-final.pdf"))
        XCTAssertNil(usableTitle("  "))
        XCTAssertNil(usableTitle("Document1"))
    }

    func testDropsDefaultAccountNames() {
        XCTAssertNil(usableAuthor("anonymous"))
        XCTAssertNil(usableAuthor("Administrator"))
        XCTAssertNil(usableAuthor(nil))
        XCTAssertEqual(usableAuthor("George Orwell"), "George Orwell")
    }

    func testCountsWhitespaceSeparatedWords() {
        XCTAssertEqual(countWords("  two  words "), 2)
        XCTAssertEqual(countWords(""), 0)
    }
}
