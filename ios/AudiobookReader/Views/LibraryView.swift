import SwiftUI
import UniformTypeIdentifiers

struct LibraryView: View {
    @Environment(AppModel.self) private var model
    @State private var isPickingFile = false
    @State private var opened: BookSummary?

    var body: some View {
        NavigationStack {
            Group {
                if model.books.isEmpty {
                    emptyShelf
                } else {
                    shelf
                }
            }
            .navigationTitle("Library")
            .toolbar {
                ToolbarItem(placement: .primaryAction) {
                    Button {
                        isPickingFile = true
                    } label: {
                        Label("Add a PDF", systemImage: "plus")
                    }
                }
            }
            .fileImporter(
                isPresented: $isPickingFile,
                allowedContentTypes: [.pdf],
                allowsMultipleSelection: false
            ) { result in
                guard case .success(let urls) = result, let url = urls.first else { return }
                Task { await model.importPDF(from: url) }
            }
            .overlay { importOverlay }
            .navigationDestination(item: $opened) { book in
                ReaderView(book: book)
            }
        }
    }

    private var shelf: some View {
        List {
            ForEach(model.books) { book in
                Button {
                    opened = book
                } label: {
                    row(book)
                }
                .buttonStyle(.plain)
                .swipeActions {
                    Button(role: .destructive) {
                        model.delete(book)
                    } label: {
                        Label("Delete", systemImage: "trash")
                    }
                }
            }
        }
        .listStyle(.plain)
    }

    private func row(_ book: BookSummary) -> some View {
        VStack(alignment: .leading, spacing: 4) {
            Text(book.title)
                .font(.headline)
            HStack(spacing: 6) {
                if let author = book.author {
                    Text(author)
                    Text("·")
                }
                Text("\(book.pageCount) pages")
                if let progress = model.progressLabel(for: book) {
                    Text("·")
                    Text(progress)
                }
            }
            .font(.footnote)
            .foregroundStyle(.secondary)
        }
        .padding(.vertical, 4)
    }

    private var emptyShelf: some View {
        ContentUnavailableView {
            Label("Nothing on the shelf", systemImage: "book.closed")
        } description: {
            Text("Add a PDF and it will be read aloud — with the screen off, if you like.")
        } actions: {
            Button("Add a PDF") { isPickingFile = true }
                .buttonStyle(.borderedProminent)
        }
    }

    @ViewBuilder
    private var importOverlay: some View {
        switch model.importState {
        case .idle:
            EmptyView()
        case .working(let progress):
            VStack(spacing: 12) {
                ProgressView(value: progress.fraction)
                    .frame(width: 200)
                Text(label(for: progress))
                    .font(.footnote)
                    .foregroundStyle(.secondary)
            }
            .padding(24)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        case .failed(let message):
            VStack(spacing: 12) {
                Text("That PDF could not be read")
                    .font(.headline)
                Text(message)
                    .font(.footnote)
                    .multilineTextAlignment(.center)
                    .foregroundStyle(.secondary)
                Button("OK") { model.dismissImportError() }
            }
            .padding(24)
            .frame(maxWidth: 320)
            .background(.regularMaterial, in: RoundedRectangle(cornerRadius: 16))
        }
    }

    private func label(for progress: IngestProgress) -> String {
        switch progress.stage {
        case .reading: return "Reading the file…"
        case .extracting:
            if let page = progress.page, let total = progress.pageCount {
                return "Extracting page \(page) of \(total)…"
            }
            return "Extracting text…"
        case .cleaning: return "Tidying the layout…"
        case .done: return "Done"
        }
    }
}
