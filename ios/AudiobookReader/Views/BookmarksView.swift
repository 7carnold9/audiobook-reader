import SwiftUI

struct BookmarksView: View {
    let bookmarks: [Bookmark]
    let onSelect: (Bookmark) -> Void
    let onDelete: (Bookmark) -> Void

    var body: some View {
        NavigationStack {
            Group {
                if bookmarks.isEmpty {
                    ContentUnavailableView(
                        "No bookmarks yet",
                        systemImage: "bookmark",
                        description: Text("Tap the bookmark button while listening to save your place.")
                    )
                } else {
                    List {
                        ForEach(bookmarks) { bookmark in
                            Button {
                                onSelect(bookmark)
                            } label: {
                                VStack(alignment: .leading, spacing: 4) {
                                    Text(bookmark.excerpt)
                                        .lineLimit(3)
                                    Text("page \(bookmark.page)")
                                        .font(.caption)
                                        .foregroundStyle(.secondary)
                                }
                            }
                            .buttonStyle(.plain)
                            .swipeActions {
                                Button(role: .destructive) {
                                    onDelete(bookmark)
                                } label: {
                                    Label("Delete", systemImage: "trash")
                                }
                            }
                        }
                    }
                }
            }
            .navigationTitle("Bookmarks")
            .navigationBarTitleDisplayMode(.inline)
        }
        .presentationDetents([.medium, .large])
    }
}
