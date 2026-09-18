import SwiftUI

struct ChapterListView: View {
    let chapters: [Chapter]
    let currentIndex: Int
    let onSelect: (Chapter) -> Void

    var body: some View {
        NavigationStack {
            List(chapters) { chapter in
                Button {
                    onSelect(chapter)
                } label: {
                    HStack {
                        Text(chapter.title)
                            .lineLimit(2)
                            .padding(.leading, CGFloat(chapter.level) * 14)
                        Spacer()
                        if isCurrent(chapter) {
                            Image(systemName: "speaker.wave.2.fill")
                                .foregroundStyle(.tint)
                        }
                        Text("p. \(chapter.page)")
                            .font(.caption)
                            .foregroundStyle(.secondary)
                    }
                }
                .buttonStyle(.plain)
            }
            .navigationTitle("Chapters")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }

    private func isCurrent(_ chapter: Chapter) -> Bool {
        guard let current = chapters.last(where: { $0.chunkIndex <= currentIndex }) else { return false }
        return current.chunkIndex == chapter.chunkIndex
    }
}
