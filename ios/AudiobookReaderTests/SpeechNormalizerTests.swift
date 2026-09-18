import XCTest
@testable import AudiobookReader

/// Ported from `src/lib/text/normalize.test.ts`.
final class SpeechNormalizerTests: XCTestCase {
    // MARK: speakToken

    func testDropsInlineCitationsAndFootnoteMarkers() {
        XCTAssertEqual(speakToken("encoders[3-5],"), ["encoders,"])
        XCTAssertEqual(speakToken("[12]"), [])
        XCTAssertEqual(speakToken("contribution\u{00B9}"), ["contribution"])
    }

    func testExpandsAbbreviationsThatReadBadlyAloud() {
        XCTAssertEqual(speakToken("e.g."), ["for", "example"])
        XCTAssertEqual(speakToken("Fig."), ["figure"])
        XCTAssertEqual(speakToken("approx."), ["approximately"])
    }

    func testNamesMathsAndSymbols() {
        XCTAssertEqual(speakToken(">"), ["greater", "than"])
        XCTAssertEqual(speakToken("18%"), ["18", "percent"])
        XCTAssertEqual(speakToken("2.1%."), ["2.1", "percent."])
        XCTAssertEqual(speakToken("\u{03B1}"), ["alpha"])
    }

    func testReplacesURLsEmailsAndBullets() {
        XCTAssertEqual(speakToken("https://github.com/example/repo"), ["a link"])
        XCTAssertEqual(speakToken("someone@example.com"), ["an email address"])
        XCTAssertEqual(speakToken("\u{2022}"), [])
    }

    func testLeavesOrdinaryWordsAlone() {
        XCTAssertEqual(speakToken("Winston"), ["Winston"])
    }

    // MARK: toSpeech

    func testKeepsEverySpokenWordPointingAtItsDisplayToken() {
        let speech = toSpeech("Growth was 18% year on year [4].")
        // The citation is dropped and its trailing full stop joins the word before it.
        XCTAssertEqual(speech.text, "Growth was 18 percent year on year.")
        XCTAssertEqual(speech.tokens, ["Growth", "was", "18%", "year", "on", "year", "[4]."])
        // "18" and "percent" both come from the single display token "18%".
        XCTAssertEqual(speech.words.map(\.token), [0, 1, 2, 2, 3, 4, 5])
    }

    func testMapsACharacterOffsetBackToTheDisplayToken() {
        let speech = toSpeech("Growth was 18% year on year [4].")
        XCTAssertEqual(tokenAtOffset(speech, 0), 0)
        XCTAssertEqual(tokenAtOffset(speech, utf16Offset(of: "percent", in: speech.text)), 2)
        XCTAssertEqual(tokenAtOffset(speech, speech.text.utf16.count - 1), 5)
    }

    func testHandlesTextThatIsEntirelyUnspeakable() {
        let speech = toSpeech("\u{2022} [12]")
        XCTAssertEqual(speech.text, "")
        XCTAssertEqual(tokenAtOffset(speech, 0), -1)
    }

    // MARK: tokenIndexAtCharacterOffset

    func testFindsTheWordUnderACharacterOffset() {
        let text = "It was a bright cold day in April."
        XCTAssertEqual(tokenIndexAtCharacterOffset(text, 0), 0) // "It"
        XCTAssertEqual(tokenIndexAtCharacterOffset(text, 3), 1) // "was"
        XCTAssertEqual(tokenIndexAtCharacterOffset(text, characterOffset(of: "bright", in: text)), 3)
        XCTAssertEqual(tokenIndexAtCharacterOffset(text, characterOffset(of: "April", in: text)), 7)
    }

    func testTreatsAClickInTheSpaceBeforeAWordAsTheWordBeforeIt() {
        // Offset 2 is the space between "It" and "was".
        XCTAssertEqual(tokenIndexAtCharacterOffset("It was a bright cold day in April.", 2), 0)
    }

    func testClampsOutsideTheString() {
        let text = "It was a bright cold day in April."
        XCTAssertEqual(tokenIndexAtCharacterOffset(text, -5), 0)
        XCTAssertEqual(tokenIndexAtCharacterOffset(text, 9999), 7)
        XCTAssertEqual(tokenIndexAtCharacterOffset("", 4), 0)
    }

    // MARK: estimateSeconds

    func testEstimatesSpokenLengthAtOneHundredAndSixtyFiveWordsAMinute() {
        XCTAssertEqual(estimateSeconds(wordCount: 165), 60, accuracy: 0.0001)
        XCTAssertEqual(estimateSeconds(wordCount: 165, rate: 2), 30, accuracy: 0.0001)
    }

    // MARK: helpers

    private func utf16Offset(of needle: String, in haystack: String) -> Int {
        guard let range = haystack.range(of: needle) else { return -1 }
        return haystack.utf16.distance(from: haystack.utf16.startIndex, to: range.lowerBound)
    }

    private func characterOffset(of needle: String, in haystack: String) -> Int {
        guard let range = haystack.range(of: needle) else { return -1 }
        return haystack.distance(from: haystack.startIndex, to: range.lowerBound)
    }
}
