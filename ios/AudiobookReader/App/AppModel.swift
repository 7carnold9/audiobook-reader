import Foundation
import Observation
import SwiftUI

/// Everything the app knows that outlives a single screen: the shelf, the
/// voices, the settings, and whatever import is running.
@MainActor
@Observable
public final class AppModel {
    public enum ImportState: Equatable {
        case idle
        case working(IngestProgress)
        case failed(String)
    }

    public private(set) var books: [BookSummary] = []
    public private(set) var voices: [Voice] = []
    public private(set) var importState: ImportState = .idle
    public var settings: AppSettings {
        didSet { store.save(settings) }
    }

    public let store: LibraryStore
    public let speech: SystemSpeechProvider

    private let previewProvider = SystemSpeechProvider()

    public init(store: LibraryStore = .shared, speech: SystemSpeechProvider = SystemSpeechProvider()) {
        self.store = store
        self.speech = speech
        self.settings = store.settings()
    }

    public func load() async {
        books = store.books()
        voices = await speech.voices()
        // A voice that has been deleted in Settings must not be spoken with.
        if let voiceID = settings.voiceID, !voices.contains(where: { $0.id == voiceID }) {
            settings.voiceID = nil
        }
    }

    /// Reads a PDF the user picked and puts it on the shelf.
    ///
    /// The ingest runs off the main actor: a few hundred pages of character
    /// bounds is seconds of work and must not block the UI.
    public func importPDF(from picked: URL) async {
        let scoped = picked.startAccessingSecurityScopedResource()
        defer { if scoped { picked.stopAccessingSecurityScopedResource() } }

        // Copy out of the provider's sandbox first: the security scope does not
        // survive the hop to a background task.
        let staged = FileManager.default.temporaryDirectory
            .appendingPathComponent(UUID().uuidString)
            .appendingPathExtension("pdf")
        do {
            try? FileManager.default.removeItem(at: staged)
            try FileManager.default.copyItem(at: picked, to: staged)
        } catch {
            importState = .failed(error.localizedDescription)
            return
        }
        defer { try? FileManager.default.removeItem(at: staged) }

        let fallbackTitle = picked.deletingPathExtension().lastPathComponent
        importState = .working(IngestProgress(stage: .reading, fraction: 0))

        // The ingest runs off the main actor and reports back onto it.
        let report: @Sendable (IngestProgress) -> Void = { [weak self] progress in
            Task { @MainActor in self?.importState = .working(progress) }
        }

        do {
            let book = try await Task.detached(priority: .userInitiated) { [staged, fallbackTitle] in
                try ingestPDF(at: staged, fallbackTitle: fallbackTitle, onProgress: report)
            }.value

            _ = try store.add(book, source: staged)
            books = store.books()
            importState = .idle
        } catch {
            importState = .failed(error.localizedDescription)
        }
    }

    public func delete(_ book: BookSummary) {
        try? store.delete(book.id)
        books = store.books()
    }

    public func dismissImportError() {
        importState = .idle
    }

    // MARK: - Voices

    public var orderedVoices: [Voice] {
        orderVoices(voices, favourites: settings.favouriteVoiceIDs, language: Locale.current.identifier)
    }

    public var favouriteVoices: [Voice] {
        shortlist(voices, favourites: settings.favouriteVoiceIDs)
    }

    public func toggleFavouriteVoice(_ id: String) {
        settings.favouriteVoiceIDs = toggleFavourite(settings.favouriteVoiceIDs, id)
    }

    /// Says a sample line in a voice, so the picker is not a list of names.
    public func preview(_ voice: Voice) {
        previewProvider.speak(
            SpeechRequest(
                text: "It was a bright cold day in April, and the clocks were striking thirteen.",
                rate: settings.rate,
                voiceID: voice.id,
                append: false,
                onEnd: { _ in }
            )
        )
    }

    public func progressLabel(for book: BookSummary) -> String? {
        guard let position = store.position(for: book.id) else { return nil }
        guard let contents = try? store.contents(for: book.id), !contents.chunks.isEmpty else {
            return nil
        }
        let percent = Int((Double(position.chunkIndex) / Double(contents.chunks.count)) * 100)
        return percent <= 0 ? nil : "\(percent)% read"
    }
}
