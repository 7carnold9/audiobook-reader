import Foundation

/// Horizontal gap, in multiples of the font size, that ends a line.
///
/// This single constant is what stops a two-column page from being read across
/// the gutter. Anything wider than this on the same baseline is a column break
/// or a table cell boundary, never a word space.
public let columnGapEm: Double = 3.5

/// Groups positioned glyph runs into visual lines.
///
/// Runs come out of the extractor roughly in reading order but split at every
/// style change, so they are re-grouped by baseline: two runs belong to the
/// same line when their baselines are within a fraction of the font height of
/// each other *and* they are not separated by a gutter-sized gap.
public func groupIntoLines(_ runs: [TextRun], page pageNumber: Int) -> [RawLine] {
    // `sorted(by:)` is not guaranteed stable in Swift, and ties are common (a
    // run of glyphs sharing a baseline and an x), so the original order is
    // folded into the comparison to keep it deterministic.
    let placed = runs
        .filter { !$0.text.isEmpty }
        .enumerated()
        // Top to bottom, then left to right.
        .sorted { left, right in
            if left.element.y != right.element.y { return left.element.y > right.element.y }
            if left.element.x0 != right.element.x0 { return left.element.x0 < right.element.x0 }
            return left.offset < right.offset
        }
        .map(\.element)

    var lines: [RawLine] = []
    var current: RawLine?
    var lastX1: Double = 0

    for run in placed {
        let tolerance = max(1.5, run.fontSize * 0.4)
        let gap = current == nil ? 0 : run.x0 - lastX1
        let sameLine = current.map { abs($0.y - run.y) <= tolerance && gap < run.fontSize * columnGapEm } ?? false

        if sameLine, var line = current {
            let needsSpace = gap > run.fontSize * 0.2
                && !(line.text.last?.isWhitespace ?? false)
                && !(run.text.first?.isWhitespace ?? false)
            line.text += (needsSpace ? " " : "") + run.text
            line.x1 = max(line.x1, run.x1)
            line.fontSize = max(line.fontSize, run.fontSize)
            current = line
        } else {
            if let line = current { append(line, to: &lines) }
            current = RawLine(
                text: run.text,
                x0: run.x0,
                x1: run.x1,
                y: run.y,
                fontSize: run.fontSize,
                page: pageNumber
            )
        }
        lastX1 = run.x1
    }
    if let line = current { append(line, to: &lines) }
    return lines
}

private func append(_ line: RawLine, to lines: inout [RawLine]) {
    let text = Scan.squashWhitespace(line.text)
    guard !text.isEmpty else { return }
    var cleaned = line
    cleaned.text = text
    lines.append(cleaned)
}
