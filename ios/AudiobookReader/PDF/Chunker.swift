import Foundation

/// Target chunk size in characters. Small enough to start fast, large enough to
/// sound natural.
private let target = 320
private let maximum = 480

/// Abbreviations that end in a full stop without ending a sentence.
private let abbreviations: Set<String> = [
    "mr", "mrs", "ms", "dr", "prof", "st", "sr", "jr", "vs", "etc", "al", "fig", "figs",
    "eq", "no", "vol", "pp", "ed", "eds", "cf", "e.g", "i.e", "approx", "inc", "ltd", "co",
]

/// Splits paragraphs into sentence-aligned chunks.
///
/// Chunks are the unit of synthesis and caching, so they must be stable: the
/// same paragraphs always produce the same chunks.
public func chunkParagraphs(_ paragraphs: [Paragraph]) -> [Chunk] {
    var chunks: [Chunk] = []
    for (paragraphIndex, paragraph) in paragraphs.enumerated() {
        let pieces = paragraph.isHeading
            ? [paragraph.text]
            : packSentences(splitSentences(paragraph.text))
        for (i, text) in pieces.enumerated() {
            chunks.append(
                Chunk(
                    index: chunks.count,
                    text: text,
                    page: paragraph.page,
                    paragraph: paragraphIndex,
                    startsParagraph: i == 0,
                    isHeading: paragraph.isHeading
                )
            )
        }
    }
    return chunks
}

/// Sentence splitter that keeps common abbreviations, initials, decimals and
/// citation markers from being mistaken for sentence ends.
public func splitSentences(_ text: String) -> [String] {
    let characters = Array(text)
    var sentences: [String] = []
    var start = 0

    for i in characters.indices {
        guard ".!?".contains(characters[i]) else { continue }

        // Consume closing quotes/brackets that belong to this sentence.
        var end = i + 1
        while end < characters.count, "\"')]\u{201D}\u{2019}".contains(characters[end]) {
            end += 1
        }
        if end < characters.count, characters[end] != " " { continue }

        let after = end + 1 < characters.count ? Array(characters[(end + 1)...]) : []
        // A sentence must be followed by something that can open one.
        if !after.isEmpty && !opensSentence(after) { continue }

        let before = characters[start..<i]
        let lastWord = lastWordOf(before)

        if characters[i] == "." {
            if abbreviations.contains(lastWord.filter { Scan.asciiLowercase.contains($0) || $0 == "." }) {
                continue
            }
            // An initial, e.g. "J. R. R.".
            if lastWord.count == 1, let only = lastWord.first, Scan.asciiLowercase.contains(only) {
                continue
            }
            // A decimal or version number.
            if let last = lastWord.last, Scan.asciiDigits.contains(last),
               let next = after.first, Scan.asciiDigits.contains(next) {
                continue
            }
        }

        let sentence = String(characters[start..<end]).trimmingCharacters(in: .whitespacesAndNewlines)
        if !sentence.isEmpty { sentences.append(sentence) }
        start = end + 1
    }

    if start < characters.count {
        let tail = String(characters[start...]).trimmingCharacters(in: .whitespacesAndNewlines)
        if !tail.isEmpty { sentences.append(tail) }
    }
    return sentences
}

/// `/^["'(“‘—]?[A-Z0-9]/` — can this text open a sentence?
private func opensSentence(_ characters: [Character]) -> Bool {
    var index = 0
    if let first = characters.first, "\"'(\u{201C}\u{2018}\u{2014}".contains(first) {
        index = 1
    }
    guard index < characters.count else { return false }
    let candidate = characters[index]
    return Scan.asciiUppercase.contains(candidate) || Scan.asciiDigits.contains(candidate)
}

/// The last whitespace- or `(`-delimited word, lower-cased — JavaScript's
/// `before.split(/[\s(]/).pop()`.
private func lastWordOf(_ characters: ArraySlice<Character>) -> String {
    var word: [Character] = []
    for character in characters.reversed() {
        if character.isWhitespace || character == "(" { break }
        word.append(character)
    }
    return String(word.reversed()).lowercased()
}

/// Greedily packs sentences up to `target` characters, hard-splitting anything huge.
private func packSentences(_ sentences: [String]) -> [String] {
    var out: [String] = []
    var current = ""

    func push() {
        let text = current.trimmingCharacters(in: .whitespacesAndNewlines)
        if !text.isEmpty { out.append(text) }
        current = ""
    }

    for sentence in sentences {
        if sentence.count > maximum {
            push()
            out.append(contentsOf: hardSplit(sentence))
            continue
        }
        if !current.isEmpty && current.count + sentence.count + 1 > target { push() }
        current = current.isEmpty ? sentence : "\(current) \(sentence)"
    }
    push()
    return out
}

/// Splits an over-long sentence at clause boundaries, then at word boundaries.
private func hardSplit(_ sentence: String) -> [String] {
    var parts: [String] = []
    var current = ""

    for piece in splitAfterClauseMarks(sentence) {
        if !current.isEmpty && current.count + piece.count + 1 > target {
            parts.append(current.trimmingCharacters(in: .whitespacesAndNewlines))
            current = ""
        }
        current = current.isEmpty ? piece : "\(current) \(piece)"
    }
    let tail = current.trimmingCharacters(in: .whitespacesAndNewlines)
    if !tail.isEmpty { parts.append(tail) }

    return parts.flatMap { part -> [String] in
        guard part.count > maximum else { return [part] }
        var out: [String] = []
        var buffer = ""
        for word in part.split(separator: " ", omittingEmptySubsequences: false).map(String.init) {
            if !buffer.isEmpty && buffer.count + word.count + 1 > target {
                out.append(buffer)
                buffer = ""
            }
            buffer = buffer.isEmpty ? word : "\(buffer) \(word)"
        }
        if !buffer.isEmpty { out.append(buffer) }
        return out
    }
}

/// `sentence.split(/(?<=[,;:—])\s+/)` — cuts at whitespace that follows a
/// clause mark, dropping the whitespace itself.
private func splitAfterClauseMarks(_ sentence: String) -> [String] {
    let characters = Array(sentence)
    var pieces: [String] = []
    var piece: [Character] = []
    var index = 0

    while index < characters.count {
        let character = characters[index]
        if character.isWhitespace, let previous = piece.last, ",;:\u{2014}".contains(previous) {
            pieces.append(String(piece))
            piece = []
            while index < characters.count, characters[index].isWhitespace { index += 1 }
            continue
        }
        piece.append(character)
        index += 1
    }
    pieces.append(String(piece))
    return pieces
}
