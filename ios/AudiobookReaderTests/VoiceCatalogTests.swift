import XCTest
@testable import AudiobookReader

/// Ported from `src/lib/tts/favourites.test.ts`.
final class VoiceCatalogTests: XCTestCase {
    private func voice(_ id: String, _ name: String, _ language: String, isDefault: Bool = false) -> Voice {
        Voice(id: id, name: name, language: language, isDefault: isDefault)
    }

    func testTogglesAVoiceOnAndOff() {
        XCTAssertEqual(toggleFavourite([], "a"), ["a"])
        XCTAssertEqual(toggleFavourite(["a", "b"], "a"), ["b"])
    }

    func testIgnoresAdditionsOnceTheShortlistIsFull() {
        let full = (0..<maxFavouriteVoices).map { "voice\($0)" }
        XCTAssertEqual(toggleFavourite(full, "extra"), full)
    }

    func testShortlistKeepsStarringOrderAndSkipsMissingVoices() {
        let voices = [voice("a", "Alice", "en-GB"), voice("c", "Carol", "en-US")]
        XCTAssertEqual(shortlist(voices, favourites: ["c", "b", "a"]).map(\.id), ["c", "a"])
    }

    func testSearchMatchesNameAndLanguage() {
        let voices = [voice("a", "Alice", "en-GB"), voice("b", "Bruno", "pt-BR")]
        XCTAssertEqual(searchVoices(voices, query: "bru").map(\.id), ["b"])
        XCTAssertEqual(searchVoices(voices, query: "EN-").map(\.id), ["a"])
        XCTAssertEqual(searchVoices(voices, query: "  ").count, 2)
    }

    func testOrdersFavouritesFirstThenLocalDefaults() {
        let voices = [
            voice("far", "Zara", "de-DE"),
            voice("local", "Lena", "en-GB"),
            voice("default", "Daniel", "en-GB", isDefault: true),
            voice("star", "Serena", "fr-FR"),
        ]
        XCTAssertEqual(
            orderVoices(voices, favourites: ["star"], language: "en-GB").map(\.id),
            ["star", "default", "local", "far"]
        )
    }
}
