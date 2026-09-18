import Foundation

private let chapterishWords = [
    "chapter", "part", "section", "book", "appendix", "prologue", "epilogue",
    "introduction", "conclusion", "preface", "foreword",
]

/// Builds the chapter list, preferring the PDF's own outline (bookmarks) and
/// falling back to detected headings.
public func buildChapters(chunks: [Chunk], outline: [OutlineEntry]) -> [Chapter] {
    guard let first = chunks.first else { return [] }

    let fromOutline = chaptersFromOutline(chunks: chunks, outline: outline)
    var chapters = fromOutline.count >= 2 ? fromOutline : chaptersFromHeadings(chunks)

    if chapters.first == nil || chapters[0].chunkIndex > 0 {
        chapters.insert(Chapter(title: "Beginning", chunkIndex: 0, page: first.page, level: 0), at: 0)
    }
    return dedupe(chapters)
}

private func chaptersFromOutline(chunks: [Chunk], outline: [OutlineEntry]) -> [Chapter] {
    var chapters: [Chapter] = []
    for entry in outline {
        guard let page = entry.page else { continue }
        guard let chunkIndex = firstChunkOnPage(chunks: chunks, page: page, title: entry.title) else {
            continue
        }
        chapters.append(
            Chapter(title: entry.title, chunkIndex: chunkIndex, page: page, level: entry.level)
        )
    }
    return stableSortByChunkIndex(chapters)
}

private func chaptersFromHeadings(_ chunks: [Chunk]) -> [Chapter] {
    let headings = chunks.filter(\.isHeading)
    // Some documents mark every bold run as a heading; when that happens keep
    // only the ones that actually name a chapter.
    let useful = headings.count > 80
        ? headings.filter { Scan.hasWordPrefix($0.text, oneOf: chapterishWords) }
        : headings
    return useful.map { chunk in
        Chapter(
            title: String(chunk.text.prefix(120)),
            chunkIndex: chunk.index,
            page: chunk.page,
            level: Scan.hasWordPrefix(chunk.text, oneOf: chapterishWords) ? 0 : 1
        )
    }
}

/// Prefers a heading chunk on the page whose text matches the outline title.
private func firstChunkOnPage(chunks: [Chunk], page: Int, title: String) -> Int? {
    let normalizedTitle = normalizeTitle(title)
    let needle = String(normalizedTitle.prefix(24))
    var fallback: Int?

    for chunk in chunks {
        if chunk.page < page { continue }
        if chunk.page > page + 1 { break }
        if fallback == nil { fallback = chunk.index }
        if chunk.page == page, normalizeTitle(chunk.text).hasPrefix(needle) {
            return chunk.index
        }
    }
    return fallback
}

private func normalizeTitle(_ text: String) -> String {
    var out = ""
    out.reserveCapacity(text.count)
    for character in text.lowercased() {
        let keep = Scan.asciiLowercase.contains(character)
            || Scan.asciiDigits.contains(character)
            || character == " "
        out.append(keep ? character : " ")
    }
    return Scan.squashWhitespace(out)
}

/// Swift's `sorted` is not stable, and two outline entries can land on the
/// same chunk; ties keep their original order so the first one wins, as in the
/// TypeScript original.
private func stableSortByChunkIndex(_ chapters: [Chapter]) -> [Chapter] {
    chapters
        .enumerated()
        .sorted { left, right in
            left.element.chunkIndex == right.element.chunkIndex
                ? left.offset < right.offset
                : left.element.chunkIndex < right.element.chunkIndex
        }
        .map(\.element)
}

private func dedupe(_ chapters: [Chapter]) -> [Chapter] {
    var out: [Chapter] = []
    for chapter in stableSortByChunkIndex(chapters) {
        if out.last?.chunkIndex == chapter.chunkIndex { continue }
        out.append(chapter)
    }
    return out
}
