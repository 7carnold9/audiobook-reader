import SwiftUI

struct ReaderView: View {
    let book: BookSummary

    @Environment(AppModel.self) private var model
    @State private var reader: ReaderModel?
    @State private var showingChapters = false
    @State private var showingVoices = false
    @State private var showingBookmarks = false

    var body: some View {
        Group {
            if let reader, let player = reader.player {
                VStack(spacing: 0) {
                    TranscriptView(
                        chunks: reader.chunks,
                        currentIndex: player.index,
                        currentToken: player.tokenIndex,
                        onTapWord: { chunkIndex, token in
                            player.start(atChunk: chunkIndex, token: token)
                        }
                    )
                    PlayerBarView(
                        player: player,
                        chapterTitle: reader.chapter(at: player.index)?.title,
                        favourites: model.favouriteVoices,
                        selectedVoiceID: player.voiceID,
                        onRateChange: { reader.setRate($0) },
                        onVoiceChange: { reader.setVoice($0) },
                        onBookmark: { reader.addBookmark() },
                        onOpenVoices: { showingVoices = true }
                    )
                }
            } else if let message = reader?.loadError {
                ContentUnavailableView("This book could not be opened", systemImage: "exclamationmark.triangle", description: Text(message))
            } else {
                ProgressView()
            }
        }
        .navigationTitle(book.title)
        .navigationBarTitleDisplayMode(.inline)
        .toolbar {
            ToolbarItemGroup(placement: .topBarTrailing) {
                Button { showingChapters = true } label: {
                    Label("Chapters", systemImage: "list.bullet")
                }
                Button { showingBookmarks = true } label: {
                    Label("Bookmarks", systemImage: "bookmark")
                }
            }
        }
        .task {
            if reader == nil {
                let created = ReaderModel(book: book, model: model)
                created.load()
                created.activate()
                reader = created
            }
        }
        .onDisappear { reader?.deactivate() }
        .sheet(isPresented: $showingChapters) {
            if let reader, let player = reader.player {
                ChapterListView(
                    chapters: reader.chapters,
                    currentIndex: player.index,
                    onSelect: { chapter in
                        player.start(atChunk: chapter.chunkIndex)
                        showingChapters = false
                    }
                )
            }
        }
        .sheet(isPresented: $showingBookmarks) {
            if let reader {
                BookmarksView(
                    bookmarks: reader.bookmarks,
                    onSelect: { bookmark in
                        reader.go(to: bookmark)
                        showingBookmarks = false
                    },
                    onDelete: { reader.removeBookmark($0) }
                )
            }
        }
        .sheet(isPresented: $showingVoices) {
            VoicePickerView(
                selectedVoiceID: reader?.player?.voiceID,
                onSelect: { voice in reader?.setVoice(voice?.id) }
            )
            .environment(model)
        }
    }
}
