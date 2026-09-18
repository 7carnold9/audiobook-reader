import SwiftUI

/// The book as text, with the word being spoken lit up.
///
/// The highlight is driven by `tokenIndex`, which counts *display* tokens —
/// `SpeechNormalizer` keeps every spoken word pointing back at the token it came
/// from, so a word that is read as something else ("18%" spoken as "18 percent")
/// still highlights the thing on screen.
struct TranscriptView: View {
    let chunks: [Chunk]
    let currentIndex: Int
    let currentToken: Int
    let onTapWord: (Int, Int) -> Void

    var body: some View {
        ScrollViewReader { proxy in
            ScrollView {
                LazyVStack(alignment: .leading, spacing: 0) {
                    ForEach(chunks) { chunk in
                        chunkView(chunk)
                            .id(chunk.index)
                            .padding(.top, chunk.startsParagraph ? 14 : 0)
                            .padding(.horizontal, 20)
                    }
                }
                .padding(.vertical, 16)
            }
            .onChange(of: currentIndex) { _, index in
                withAnimation(.easeInOut(duration: 0.25)) {
                    proxy.scrollTo(index, anchor: .center)
                }
            }
        }
    }

    @ViewBuilder
    private func chunkView(_ chunk: Chunk) -> some View {
        let isCurrent = chunk.index == currentIndex
        let tokens = Scan.words(chunk.text)

        if chunk.isHeading {
            Text(chunk.text)
                .font(.title3.weight(.semibold))
                .padding(.vertical, 8)
                .onTapGesture { onTapWord(chunk.index, 0) }
        } else {
            // A flow layout of tappable words: tapping one starts narration
            // there, which is the single most useful thing a transcript can do.
            WordFlow(spacing: 4, lineSpacing: 6) {
                ForEach(Array(tokens.enumerated()), id: \.offset) { offset, word in
                    Text(word)
                        .font(.body)
                        .foregroundStyle(isCurrent ? Color.primary : Color.secondary)
                        .padding(.horizontal, 2)
                        .background(
                            (isCurrent && offset == currentToken)
                                ? Color.accentColor.opacity(0.25)
                                : Color.clear,
                            in: RoundedRectangle(cornerRadius: 4)
                        )
                        .onTapGesture { onTapWord(chunk.index, offset) }
                }
            }
        }
    }
}

/// A minimal wrapping layout — words flow and wrap like text, but each one is
/// its own hit target.
struct WordFlow: Layout {
    var spacing: CGFloat = 4
    var lineSpacing: CGFloat = 6

    func sizeThatFits(proposal: ProposedViewSize, subviews: Subviews, cache: inout ()) -> CGSize {
        let width = proposal.width ?? .infinity
        var x: CGFloat = 0
        var y: CGFloat = 0
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > 0 && x + size.width > width {
                x = 0
                y += lineHeight + lineSpacing
                lineHeight = 0
            }
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
        return CGSize(width: width == .infinity ? x : width, height: y + lineHeight)
    }

    func placeSubviews(
        in bounds: CGRect,
        proposal: ProposedViewSize,
        subviews: Subviews,
        cache: inout ()
    ) {
        var x = bounds.minX
        var y = bounds.minY
        var lineHeight: CGFloat = 0

        for subview in subviews {
            let size = subview.sizeThatFits(.unspecified)
            if x > bounds.minX && x + size.width > bounds.maxX {
                x = bounds.minX
                y += lineHeight + lineSpacing
                lineHeight = 0
            }
            subview.place(at: CGPoint(x: x, y: y), anchor: .topLeading, proposal: ProposedViewSize(size))
            x += size.width + spacing
            lineHeight = max(lineHeight, size.height)
        }
    }
}
