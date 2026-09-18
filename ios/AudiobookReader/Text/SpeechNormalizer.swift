import Foundation

/// Prepares text for speech without losing the link back to what is on screen.
///
/// Technical prose reads badly out loud as-is: inline citations, URLs, maths
/// symbols and abbreviations all need rewriting. Doing that on a plain string
/// would break word highlighting, so normalization is done token by token and
/// every spoken word keeps a pointer back to the display token it came from.
///
/// Offsets are **UTF-16** offsets, which is what
/// `speechSynthesizer(_:willSpeakRangeOfSpeechString:utterance:)` hands back in
/// its `NSRange`, so a delegate callback maps straight onto a display token
/// with no re-indexing.
public struct SpokenWord: Equatable, Sendable {
    /// UTF-16 offset of this word within `SpeechText.text`.
    public var offset: Int
    /// Index into `SpeechText.tokens`.
    public var token: Int

    public init(offset: Int, token: Int) {
        self.offset = offset
        self.token = token
    }
}

public struct SpeechText: Equatable, Sendable {
    /// What gets sent to the synthesizer.
    public var text: String
    /// Display tokens, in order, as shown in the transcript.
    public var tokens: [String]
    public var words: [SpokenWord]

    public init(text: String, tokens: [String], words: [SpokenWord]) {
        self.text = text
        self.tokens = tokens
        self.words = words
    }
}

private let abbreviationSpeech: [String: String] = [
    "e.g.": "for example",
    "i.e.": "that is",
    "etc.": "et cetera",
    "et": "et",
    "al.": "others",
    "vs.": "versus",
    "vs": "versus",
    "cf.": "compare",
    "fig.": "figure",
    "figs.": "figures",
    "eq.": "equation",
    "eqs.": "equations",
    "ref.": "reference",
    "refs.": "references",
    "sec.": "section",
    "ch.": "chapter",
    "pp.": "pages",
    "p.": "page",
    "no.": "number",
    "approx.": "approximately",
    "ca.": "circa",
    "est.": "estimated",
    "incl.": "including",
]

private let symbolSpeech: [Character: String] = [
    "=": "equals",
    "+": "plus",
    "\u{00B1}": "plus or minus",
    "\u{00D7}": "times",
    "\u{00F7}": "divided by",
    "<": "less than",
    ">": "greater than",
    "\u{2264}": "less than or equal to",
    "\u{2265}": "greater than or equal to",
    "\u{2248}": "approximately",
    "\u{2260}": "not equal to",
    "\u{2192}": "to",
    "\u{221E}": "infinity",
    "\u{2211}": "the sum of",
    "\u{221A}": "the square root of",
    "\u{2202}": "partial",
    "%": "percent",
    "\u{00B0}": "degrees",
    "\u{03B1}": "alpha",
    "\u{03B2}": "beta",
    "\u{03B3}": "gamma",
    "\u{03B4}": "delta",
    "\u{03B5}": "epsilon",
    "\u{03B8}": "theta",
    "\u{03BB}": "lambda",
    "\u{03BC}": "mu",
    "\u{03C0}": "pi",
    "\u{03C3}": "sigma",
    "\u{03C6}": "phi",
    "\u{03C9}": "omega",
    "\u{0394}": "delta",
    "\u{03A3}": "sigma",
    "\u{03A9}": "omega",
    "&": "and",
    "@": "at",
    "\u{00A7}": "section",
    "\u{00A9}": "copyright",
]

private let bulletGlyphs: Set<Character> = [
    "\u{2022}", "\u{00B7}", "\u{25AA}", "\u{25E6}", "\u{2023}", "*",
    "\u{25A0}", "\u{25CF}", "\u{2013}", "\u{2014}", "|",
]

private let superscriptDigits: Set<Character> = [
    "\u{00B9}", "\u{00B2}", "\u{00B3}", "\u{2070}",
    "\u{2074}", "\u{2075}", "\u{2076}", "\u{2077}", "\u{2078}", "\u{2079}",
]

private let citationSeparators: Set<Character> = ["\u{2013}", "\u{2014}", ",", "-"]

/// Converts a display string into speech text plus a word-level alignment map.
public func toSpeech(_ display: String) -> SpeechText {
    let tokens = Scan.words(display)
    var words: [SpokenWord] = []
    var text = ""
    var offset = 0

    for (index, token) in tokens.enumerated() {
        for spoken in speakToken(token) {
            // Punctuation left behind by a removed citation belongs to the word
            // before it, not to a word of its own.
            if !text.isEmpty && Scan.isTrailingPunctuation(spoken) {
                text += spoken
                offset += spoken.utf16.count
                continue
            }
            if !text.isEmpty {
                text += " "
                offset += 1
            }
            words.append(SpokenWord(offset: offset, token: index))
            text += spoken
            offset += spoken.utf16.count
        }
    }

    return SpeechText(text: text, tokens: tokens, words: words)
}

/// Expands one display token into zero or more spoken words.
public func speakToken(_ token: String) -> [String] {
    var word = stripSuperscripts(stripNumericCitations(token))
        .trimmingCharacters(in: .whitespacesAndNewlines)

    if word.isEmpty { return [] }
    if word.allSatisfy({ bulletGlyphs.contains($0) }) { return [] }

    if looksLikeURL(word) { return ["a link"] }
    if looksLikeEmail(word) { return ["an email address"] }

    // Em/en dashes read as pauses rather than words.
    word = word
        .replacingOccurrences(of: "\u{2014}", with: ", ")
        .replacingOccurrences(of: "\u{2013}", with: ", ")

    let lower = String(word.lowercased().drop(while: { "(\"'\u{201C}\u{2018}".contains($0) }))
    var trimmedLower = lower
    while let last = trimmedLower.last, ",;:)".contains(last) { trimmedLower.removeLast() }
    if let expansion = abbreviationSpeech[lower] ?? abbreviationSpeech[trimmedLower] {
        return expansion.split(separator: " ").map(String.init)
    }

    // Replace standalone or embedded math/symbol characters with their names.
    var expanded = ""
    for character in word {
        if let name = symbolSpeech[character] {
            expanded += " \(name) "
        } else {
            expanded.append(character)
        }
    }

    var pieces: [String] = []
    for piece in Scan.words(expanded) {
        if piece.allSatisfy({ bulletGlyphs.contains($0) }) { continue }
        // Expanding a symbol can strand the punctuation that followed it
        // ("2.1%." -> "2.1 percent ."); glue it back onto the previous word.
        if Scan.isTrailingPunctuation(piece), !pieces.isEmpty {
            pieces[pieces.count - 1] += piece
        } else {
            pieces.append(piece)
        }
    }
    return pieces
}

/// Rough spoken length, used to build the scrub timeline before any audio exists.
public func estimateSeconds(wordCount: Int, rate: Double = 1) -> Double {
    let wordsPerMinute = 165 * rate
    return (Double(wordCount) / wordsPerMinute) * 60
}

/// Maps a UTF-16 offset inside speech text back to a display token index,
/// or -1 when nothing has been spoken yet.
public func tokenAtOffset(_ speech: SpeechText, _ characterIndex: Int) -> Int {
    var low = 0
    var high = speech.words.count - 1
    var best = -1
    while low <= high {
        let mid = (low + high) / 2
        if speech.words[mid].offset <= characterIndex {
            best = mid
            low = mid + 1
        } else {
            high = mid - 1
        }
    }
    return best >= 0 ? speech.words[best].token : -1
}

/// Maps a character offset in a display string to the index of the word token
/// containing it — the bridge between "the reader tapped here" and the token
/// indices the player speaks from.
///
/// Unlike `tokenAtOffset`, this one counts `Character`s: its input is a hit test
/// against text on screen, not a synthesizer callback.
public func tokenIndexAtCharacterOffset(_ text: String, _ characterOffset: Int) -> Int {
    guard characterOffset > 0 else { return 0 }
    let characters = Array(text)
    guard !characters.isEmpty else { return 0 }

    var index = -1
    var insideToken = false
    let limit = min(characterOffset, characters.count - 1)
    for i in 0...limit {
        if characters[i].isWhitespace {
            insideToken = false
        } else if !insideToken {
            index += 1
            insideToken = true
        }
    }
    return max(0, index)
}

// MARK: - Token scanning

/// Removes inline numeric citations: `model[12]`, `[3-5]`, `result[1],`.
/// Equivalent to `/\[\s*\d+(\s*[–—,-]\s*\d+)*\s*\]/g`.
private func stripNumericCitations(_ text: String) -> String {
    guard text.contains("[") else { return text }
    let characters = Array(text)
    var out: [Character] = []
    var index = 0

    while index < characters.count {
        if characters[index] == "[", let close = citationEnd(characters, from: index) {
            index = close + 1
            continue
        }
        out.append(characters[index])
        index += 1
    }
    return String(out)
}

/// The index of the `]` closing a numeric citation that opens at `open`, if any.
private func citationEnd(_ characters: [Character], from open: Int) -> Int? {
    var index = open + 1

    func skipWhitespace() {
        while index < characters.count, characters[index].isWhitespace { index += 1 }
    }
    func takeDigits() -> Bool {
        let start = index
        while index < characters.count, Scan.asciiDigits.contains(characters[index]) { index += 1 }
        return index > start
    }

    skipWhitespace()
    guard takeDigits() else { return nil }

    while true {
        let mark = index
        skipWhitespace()
        guard index < characters.count, citationSeparators.contains(characters[index]) else {
            index = mark
            break
        }
        index += 1
        skipWhitespace()
        // A separator with no number after it means this is not a citation at all:
        // the regular expression would backtrack and then fail on the `]`.
        guard takeDigits() else { return nil }
    }

    skipWhitespace()
    guard index < characters.count, characters[index] == "]" else { return nil }
    return index
}

private func stripSuperscripts(_ text: String) -> String {
    text.filter { !superscriptDigits.contains($0) }
}

/// `/^(https?:\/\/|www\.)\S+$/i`
private func looksLikeURL(_ word: String) -> Bool {
    let lower = word.lowercased()
    for prefix in ["http://", "https://", "www."] where lower.hasPrefix(prefix) {
        let rest = lower.dropFirst(prefix.count)
        return !rest.isEmpty && !rest.contains(where: { $0.isWhitespace })
    }
    return false
}

/// `/^[^\s@]+@[^\s@]+\.[a-z]{2,}$/i`
private func looksLikeEmail(_ word: String) -> Bool {
    let parts = word.split(separator: "@", omittingEmptySubsequences: false)
    guard parts.count == 2 else { return false }
    let local = parts[0]
    let domain = parts[1]
    guard !local.isEmpty, !local.contains(where: { $0.isWhitespace }) else { return false }
    guard let dot = domain.lastIndex(of: "."), dot != domain.startIndex else { return false }
    let host = domain[domain.startIndex..<dot]
    let suffix = domain[domain.index(after: dot)...]
    guard !host.contains(where: { $0.isWhitespace }) else { return false }
    guard suffix.count >= 2 else { return false }
    return suffix.allSatisfy { $0.isLetter && $0.isASCII }
}
