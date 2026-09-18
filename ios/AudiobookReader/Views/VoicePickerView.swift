import SwiftUI

/// Browsing, previewing and shortlisting voices.
///
/// The narration is only as good as the installed voices, and the ones that
/// ship by default are the robotic ones. The good ones are a download away in
/// Settings → Accessibility → Spoken Content → Voices, so the picker says so
/// rather than leaving the reader to wonder why it sounds like that.
struct VoicePickerView: View {
    let selectedVoiceID: String?
    let onSelect: (Voice?) -> Void

    @Environment(AppModel.self) private var model
    @Environment(\.dismiss) private var dismiss
    @State private var query = ""

    private var results: [Voice] {
        searchVoices(model.orderedVoices, query: query)
    }

    var body: some View {
        NavigationStack {
            List {
                Section {
                    Button {
                        onSelect(nil)
                        dismiss()
                    } label: {
                        HStack {
                            Text("System default")
                            Spacer()
                            if selectedVoiceID == nil {
                                Image(systemName: "checkmark").foregroundStyle(.tint)
                            }
                        }
                    }
                    .buttonStyle(.plain)
                }

                Section {
                    ForEach(results) { voice in
                        row(voice)
                    }
                } header: {
                    Text("\(model.voices.count) voices installed")
                } footer: {
                    Text("More voices — including the natural-sounding ones — download from Settings → Accessibility → Spoken Content → Voices.")
                }
            }
            .searchable(text: $query, prompt: "Search voices and languages")
            .navigationTitle("Voice")
            .navigationBarTitleDisplayMode(.inline)
            .toolbar {
                ToolbarItem(placement: .confirmationAction) {
                    Button("Done") { dismiss() }
                }
            }
        }
    }

    private func row(_ voice: Voice) -> some View {
        HStack(spacing: 12) {
            Button {
                model.toggleFavouriteVoice(voice.id)
            } label: {
                Image(systemName: isFavourite(voice) ? "star.fill" : "star")
                    .foregroundStyle(isFavourite(voice) ? .yellow : .secondary)
            }
            .buttonStyle(.plain)
            .disabled(!isFavourite(voice) && model.settings.favouriteVoiceIDs.count >= maxFavouriteVoices)

            Button {
                onSelect(voice)
            } label: {
                VStack(alignment: .leading, spacing: 2) {
                    HStack(spacing: 6) {
                        Text(voice.name)
                        if voice.quality > .standard {
                            Text(voice.quality == .premium ? "Premium" : "Enhanced")
                                .font(.caption2)
                                .padding(.horizontal, 6)
                                .padding(.vertical, 2)
                                .background(Color.secondary.opacity(0.15), in: Capsule())
                        }
                    }
                    Text(voice.language)
                        .font(.caption)
                        .foregroundStyle(.secondary)
                }
            }
            .buttonStyle(.plain)

            Spacer()

            Button {
                model.preview(voice)
            } label: {
                Image(systemName: "play.circle")
            }
            .buttonStyle(.plain)

            if voice.id == selectedVoiceID {
                Image(systemName: "checkmark").foregroundStyle(.tint)
            }
        }
    }

    private func isFavourite(_ voice: Voice) -> Bool {
        model.settings.favouriteVoiceIDs.contains(voice.id)
    }
}
