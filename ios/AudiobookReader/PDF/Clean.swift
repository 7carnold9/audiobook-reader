import Foundation

public struct CleanStats: Equatable, Codable, Sendable {
    public var bodyFontSize: Double
    public var droppedMarginLines: Int
    public var droppedFootnoteLines: Int
    public var twoColumnPages: Int

    public init(
        bodyFontSize: Double = 10,
        droppedMarginLines: Int = 0,
        droppedFootnoteLines: Int = 0,
        twoColumnPages: Int = 0
    ) {
        self.bodyFontSize = bodyFontSize
        self.droppedMarginLines = droppedMarginLines
        self.droppedFootnoteLines = droppedFootnoteLines
        self.twoColumnPages = twoColumnPages
    }
}

public struct CleanResult: Equatable, Sendable {
    public var paragraphs: [Paragraph]
    public var stats: CleanStats
}

/// A run of lines that belong together in reading order.
public struct TextBlock: Equatable, Sendable {
    public var column: Int
    public var lines: [RawLine]
    /// True for full-width elements on a multi-column page: titles, captions.
    public var isSpanning: Bool

    public init(column: Int, lines: [RawLine], isSpanning: Bool = false) {
        self.column = column
        self.lines = lines
        self.isSpanning = isSpanning
    }
}

private let chapterWords = ["chapter", "part", "section", "appendix", "prologue", "epilogue"]

/// Turns positioned lines into readable paragraphs: column-aware ordering,
/// repeated header/footer removal, footnote removal, de-hyphenation and
/// paragraph-break detection.
public func cleanPages(_ pages: [RawPage]) -> CleanResult {
    let bodyFontSize = medianFontSize(pages.flatMap(\.lines))
    let repeated = findRepeatedMarginLines(pages)
    var stats = CleanStats(bodyFontSize: bodyFontSize)

    /// `right`/`width` describe the column the paragraph's last line came from,
    /// so that a page or column break can ask whether that line ran to the margin.
    struct OpenParagraph {
        var lines: [RawLine]
        var isHeading: Bool
        var right: Double
        var width: Double
    }

    var paragraphs: [Paragraph] = []
    var open: OpenParagraph?

    func flush() {
        guard let current = open else { return }
        let text = joinLines(current.lines)
        if !text.isEmpty, let first = current.lines.first {
            paragraphs.append(Paragraph(text: text, page: first.page, isHeading: current.isHeading))
        }
        open = nil
    }

    for page in pages {
        var kept: [RawLine] = []
        for line in page.lines {
            if isMarginNoise(line, page: page, repeated: repeated) {
                stats.droppedMarginLines += 1
                continue
            }
            if isFootnote(line, page: page, bodyFontSize: bodyFontSize) {
                stats.droppedFootnoteLines += 1
                continue
            }
            kept.append(line)
        }

        var cleanedPage = page
        cleanedPage.lines = kept
        let blocks = orderLines(cleanedPage)
        if blocks.count > 1 || blocks.contains(where: { $0.column > 0 }) {
            stats.twoColumnPages += 1
        }

        // Heading detection compares against the full text width of the page: a
        // one-line block is not "short" relative to itself.
        let pageWidth: Double = kept.isEmpty
            ? page.width
            : (kept.map(\.x1).max() ?? page.width) - (kept.map(\.x0).min() ?? 0)

        for block in blocks {
            guard !block.lines.isEmpty else { continue }
            // A full-width element on a multi-column page is not part of the
            // column flow, so it never continues or is continued by the prose
            // around it.
            if block.isSpanning { flush() }

            let gap = medianGap(block.lines)
            let left = block.lines.map(\.x0).min() ?? 0
            let right = block.lines.map(\.x1).max() ?? 0
            let width = max(right - left, 1)

            for (i, line) in block.lines.enumerated() {
                let heading = isHeading(line, bodyFontSize: bodyFontSize, width: pageWidth)
                let indented = line.x0 - left > width * 0.03 && line.x0 - left < width * 0.25
                let broken: Bool

                if i > 0 {
                    broken = startsParagraph(
                        line,
                        previous: block.lines[i - 1],
                        gap: gap,
                        left: left,
                        right: right,
                        width: width
                    )
                } else if let current = open, let previous = current.lines.last {
                    // At a block boundary — a new page or the next column —
                    // prose only continues when the previous line ran to its own
                    // right margin.
                    let ranToMargin = previous.x1 >= current.right - current.width * 0.12
                    broken = indented || !ranToMargin
                } else {
                    broken = true
                }

                if open == nil || heading || open?.isHeading == true || broken {
                    flush()
                    open = OpenParagraph(lines: [line], isHeading: heading, right: right, width: width)
                } else {
                    open?.lines.append(line)
                    open?.right = right
                    open?.width = width
                }
            }

            if block.isSpanning { flush() }
        }
        // A paragraph may legitimately run across a page break, so `open` is kept.
    }
    flush()

    return CleanResult(paragraphs: paragraphs, stats: stats)
}

/// Orders a page into reading-order blocks. Single-column pages produce one
/// block; two-column pages are split at the widest empty gutter, with
/// full-width lines (titles, figure captions) kept as their own blocks so a
/// spanning element does not get interleaved into a column.
public func orderLines(_ page: RawPage) -> [TextBlock] {
    let lines = page.lines
        .enumerated()
        .sorted { left, right in
            if left.element.y != right.element.y { return left.element.y > right.element.y }
            if left.element.x0 != right.element.x0 { return left.element.x0 < right.element.x0 }
            return left.offset < right.offset
        }
        .map(\.element)

    guard lines.count >= 6 else {
        return lines.isEmpty ? [] : [TextBlock(column: 0, lines: lines)]
    }
    guard let gutter = findGutter(page: page, lines: lines) else {
        return [TextBlock(column: 0, lines: lines)]
    }

    var blocks: [TextBlock] = []
    var left: [RawLine] = []
    var right: [RawLine] = []
    var spanning: [RawLine] = []

    func flushColumns() {
        if !left.isEmpty { blocks.append(TextBlock(column: 0, lines: left)) }
        if !right.isEmpty { blocks.append(TextBlock(column: 1, lines: right)) }
        left = []
        right = []
    }
    func flushSpanning() {
        if !spanning.isEmpty { blocks.append(TextBlock(column: 0, lines: spanning, isSpanning: true)) }
        spanning = []
    }

    for line in lines {
        if line.x0 < gutter && line.x1 > gutter {
            // Spans the gutter: close the columns above it and keep it separate.
            flushColumns()
            spanning.append(line)
        } else {
            flushSpanning()
            if line.x1 <= gutter { left.append(line) } else { right.append(line) }
        }
    }
    flushSpanning()
    flushColumns()
    return blocks
}

/// Returns the x of an empty vertical gutter near the middle of the page, if any.
private func findGutter(page: RawPage, lines: [RawLine]) -> Double? {
    guard !lines.isEmpty else { return nil }
    var best: (x: Double, crossings: Int, balance: Double)?

    // The original walks `fraction` from 0.35 to 0.65 in steps of 0.01; stepping
    // an integer avoids the accumulated floating-point drift that decides
    // whether the last iteration happens at all.
    for step in 0...30 {
        let fraction = 0.35 + Double(step) * 0.01
        let x = page.width * fraction
        var crossings = 0
        var leftCount = 0
        var rightCount = 0
        for line in lines {
            if line.x0 < x && line.x1 > x { crossings += 1 }
            else if line.x1 <= x { leftCount += 1 }
            else { rightCount += 1 }
        }
        let balance = Double(min(leftCount, rightCount)) / Double(lines.count)
        if best == nil || crossings < best!.crossings
            || (crossings == best!.crossings && balance > best!.balance) {
            best = (x, crossings, balance)
        }
    }

    guard let winner = best else { return nil }
    // Demand a near-empty gutter and a genuine split, otherwise call it one
    // column. A little slack in the crossing count covers spanning elements such
    // as a centred title or a wide figure, which `orderLines` pulls out anyway.
    let emptiness = Double(winner.crossings) / Double(lines.count)
    return emptiness <= 0.15 && winner.balance >= 0.2 ? winner.x : nil
}

private func startsParagraph(
    _ line: RawLine,
    previous: RawLine,
    gap: Double,
    left: Double,
    right: Double,
    width: Double
) -> Bool {
    let verticalGap = previous.y - line.y
    if gap > 0 && verticalGap > gap * 1.5 { return true }
    // First-line indent.
    if line.x0 - left > width * 0.03 && line.x0 - left < width * 0.25 { return true }
    // Previous line ended a sentence well short of the right margin.
    if Scan.endsSentence(previous.text) && previous.x1 < right - width * 0.12 { return true }
    return false
}

func isHeading(_ line: RawLine, bodyFontSize: Double, width: Double) -> Bool {
    if line.text.count > 90 { return false }
    if Scan.hasWordPrefix(line.text, oneOf: chapterWords) { return true }
    let big = line.fontSize >= bodyFontSize * 1.18
    let short = line.x1 - line.x0 < width * 0.75
    return big && short && !Scan.endsSentence(line.text)
}

private func isMarginNoise(_ line: RawLine, page: RawPage, repeated: Set<String>) -> Bool {
    let inMargin = line.y > page.height * 0.92 || line.y < page.height * 0.08
    guard inMargin else { return false }
    if looksLikePageNumber(line.text) { return true }
    return repeated.contains(normalizeMargin(line.text))
}

/// `/^(page\s+)?[ivxlcdm\d]{1,6}$/i` — a bare arabic or roman page number.
private func looksLikePageNumber(_ text: String) -> Bool {
    let lower = text.lowercased()
    var body = Substring(lower)
    if body.hasPrefix("page") {
        let afterWord = body.dropFirst(4)
        let afterSpace = afterWord.drop(while: { $0.isWhitespace })
        // `\s+` needs at least one space, so only take the branch if one was eaten.
        if afterSpace.count < afterWord.count { body = afterSpace }
    }
    guard (1...6).contains(body.count) else { return false }
    return body.allSatisfy { "ivxlcdm0123456789".contains($0) }
}

private func isFootnote(_ line: RawLine, page: RawPage, bodyFontSize: Double) -> Bool {
    let small = line.fontSize <= bodyFontSize * 0.86
    let low = line.y < page.height * 0.28
    return small && low
}

/// Header/footer text repeats across pages with only the page number changing,
/// so lines are compared with digits masked out.
public func findRepeatedMarginLines(_ pages: [RawPage]) -> Set<String> {
    var counts: [String: Int] = [:]
    for page in pages {
        let candidates = page.lines.filter {
            $0.y > page.height * 0.92 || $0.y < page.height * 0.08
        }
        for key in Set(candidates.map { normalizeMargin($0.text) }) where !key.isEmpty {
            counts[key, default: 0] += 1
        }
    }
    // Recto/verso headers only appear on half the pages, so the bar is low; very
    // short documents would never clear a fixed minimum of three.
    let threshold = pages.count <= 4
        ? 2
        : max(3, Int((Double(pages.count) * 0.25).rounded(.up)))
    return Set(counts.filter { $0.value >= threshold }.map(\.key))
}

private func normalizeMargin(_ text: String) -> String {
    var masked = ""
    masked.reserveCapacity(text.count)
    var inDigits = false
    for character in text.lowercased() {
        if character.isNumber && character.isASCII {
            if !inDigits { masked.append("#") }
            inDigits = true
        } else {
            inDigits = false
            masked.append(character)
        }
    }
    return Scan.squashWhitespace(masked)
}

/// The hyphen characters that can end a line mid-word: U+2010…U+2014 plus the
/// plain hyphen-minus.
private let lineBreakHyphens: Set<Character> = ["\u{2010}", "\u{2011}", "\u{2012}", "\u{2013}", "\u{2014}", "-"]

/// Joins lines, repairing words split by an end-of-line hyphen.
public func joinLines(_ lines: [RawLine]) -> String {
    var out = ""
    for (i, line) in lines.enumerated() {
        let text = line.text.trimmingCharacters(in: .whitespacesAndNewlines)
        guard !text.isEmpty else { continue }
        if i == 0 {
            out = text
            continue
        }
        // A hyphen before a lower-case continuation is a broken word; one before
        // a capital ("Anglo-French") is part of the word and is kept.
        if let last = out.last, lineBreakHyphens.contains(last),
           let first = text.first, Scan.asciiLowercase.contains(first) {
            out.removeLast()
            out += text
        } else {
            out += " " + text
        }
    }
    return Scan.squashWhitespace(out)
}

private func medianFontSize(_ lines: [RawLine]) -> Double {
    guard !lines.isEmpty else { return 10 }
    // Weighted by characters so a handful of huge title glyphs cannot skew it.
    var sizes: [Double] = []
    for line in lines {
        let weight = max(1, Int((Double(line.text.count) / 10).rounded()))
        sizes.append(contentsOf: repeatElement(line.fontSize, count: weight))
    }
    sizes.sort()
    return sizes[sizes.count / 2]
}

private func medianGap(_ lines: [RawLine]) -> Double {
    var gaps: [Double] = []
    for i in 1..<max(lines.count, 1) {
        let gap = lines[i - 1].y - lines[i].y
        if gap > 0 { gaps.append(gap) }
    }
    guard !gaps.isEmpty else { return 0 }
    gaps.sort()
    return gaps[gaps.count / 2]
}
