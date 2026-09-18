import Foundation

/// Small character predicates shared across the pipeline.
///
/// The TypeScript original leans on regular expressions throughout. They are
/// ported as explicit scans rather than `NSRegularExpression`: the patterns are
/// short, the scans are cheaper in a hot loop over every character of a book,
/// and a mistyped pattern string fails at runtime whereas a mistyped scan fails
/// to compile.
public enum Scan {
    public static let asciiDigits = Set("0123456789")
    public static let asciiLowercase = Set("abcdefghijklmnopqrstuvwxyz")
    public static let asciiUppercase = Set("ABCDEFGHIJKLMNOPQRSTUVWXYZ")

    /// `/[.!?]["')\]]?$/` — a sentence end, allowing one closing mark after it.
    public static func endsSentence(_ text: String) -> Bool {
        var characters = Array(text)
        if let last = characters.last, "\"')]".contains(last) {
            characters.removeLast()
        }
        guard let last = characters.last else { return false }
        return ".!?".contains(last)
    }

    /// `/[.!?]["')\]”’]?$/` — the narration variant, which also allows curly quotes.
    public static func endsSpokenSentence(_ text: String) -> Bool {
        var characters = Array(text)
        if let last = characters.last, "\"')]\u{201D}\u{2019}".contains(last) {
            characters.removeLast()
        }
        guard let last = characters.last else { return false }
        return ".!?".contains(last)
    }

    /// Collapses every run of whitespace to a single space and trims the ends.
    public static func squashWhitespace(_ text: String) -> String {
        var out = ""
        out.reserveCapacity(text.count)
        var pendingSpace = false
        for character in text {
            if character.isWhitespace {
                if !out.isEmpty { pendingSpace = true }
            } else {
                if pendingSpace { out.append(" ") }
                pendingSpace = false
                out.append(character)
            }
        }
        return out
    }

    /// Splits on runs of whitespace, dropping empty pieces — JavaScript's
    /// `text.split(/\s+/).filter(Boolean)`.
    public static func words(_ text: String) -> [String] {
        text.split(whereSeparator: { $0.isWhitespace }).map(String.init)
    }

    /// True when every character is one of `.,;:!?)]` and there is at least one.
    public static func isTrailingPunctuation(_ text: String) -> Bool {
        guard !text.isEmpty else { return false }
        return text.allSatisfy { ".,;:!?)]".contains($0) }
    }
}

extension Scan {
    /// `/^(one|two|...)\b/i` — a case-insensitive word-boundary prefix test.
    public static func hasWordPrefix(_ text: String, oneOf words: [String]) -> Bool {
        let lower = text.lowercased()
        for word in words where lower.hasPrefix(word) {
            let rest = lower.dropFirst(word.count)
            guard let next = rest.first else { return true }
            // `\b` sits between a word character and a non-word character.
            let isWordCharacter = next.isLetter || next.isNumber || next == "_"
            if !isWordCharacter { return true }
        }
        return false
    }
}
