import SwiftUI

struct PlayerBarView: View {
    let player: PlayerModel
    let chapterTitle: String?
    let favourites: [Voice]
    let selectedVoiceID: String?
    let onRateChange: (Double) -> Void
    let onVoiceChange: (String?) -> Void
    let onBookmark: () -> Void
    let onOpenVoices: () -> Void

    private static let rates: [Double] = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5]

    var body: some View {
        VStack(spacing: 10) {
            if let message = player.errorMessage {
                Text(message)
                    .font(.footnote)
                    .foregroundStyle(.red)
                    .multilineTextAlignment(.center)
            }

            scrubber
            transport
            settings
        }
        .padding(.horizontal, 16)
        .padding(.top, 10)
        .padding(.bottom, 6)
        .background(.regularMaterial)
    }

    private var scrubber: some View {
        HStack(spacing: 8) {
            Text(formatTime(player.elapsed))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)

            Slider(
                value: Binding(
                    get: { min(player.elapsed, max(player.duration, 1)) },
                    set: { player.seek(toSeconds: $0) }
                ),
                in: 0...max(player.duration, 1)
            )
            .accessibilityLabel("Position in book")

            Text("-" + formatTime(max(0, player.duration - player.elapsed)))
                .font(.caption.monospacedDigit())
                .foregroundStyle(.secondary)
        }
    }

    private var transport: some View {
        HStack(spacing: 28) {
            Button { player.skip(seconds: -15) } label: {
                Image(systemName: "gobackward.15")
                    .font(.title2)
            }
            .accessibilityLabel("Back 15 seconds")

            Button { player.toggle() } label: {
                Image(systemName: player.status == .playing ? "pause.circle.fill" : "play.circle.fill")
                    .font(.system(size: 48))
            }
            .accessibilityLabel(player.status == .playing ? "Pause" : "Play")

            Button { player.skip(seconds: 15) } label: {
                Image(systemName: "goforward.15")
                    .font(.title2)
            }
            .accessibilityLabel("Forward 15 seconds")

            Button(action: onBookmark) {
                Image(systemName: "bookmark")
                    .font(.title3)
            }
            .accessibilityLabel("Bookmark this spot")
        }
    }

    private var settings: some View {
        HStack(spacing: 12) {
            Menu {
                ForEach(Self.rates, id: \.self) { rate in
                    Button {
                        onRateChange(rate)
                    } label: {
                        if rate == player.rate {
                            Label(speedLabel(rate), systemImage: "checkmark")
                        } else {
                            Text(speedLabel(rate))
                        }
                    }
                }
            } label: {
                Text(speedLabel(player.rate))
                    .font(.footnote.weight(.medium))
                    .padding(.horizontal, 10)
                    .padding(.vertical, 5)
                    .background(Color.secondary.opacity(0.15), in: Capsule())
            }

            ScrollView(.horizontal, showsIndicators: false) {
                HStack(spacing: 6) {
                    ForEach(favourites) { voice in
                        Button {
                            onVoiceChange(voice.id)
                        } label: {
                            Text(voice.name)
                                .font(.caption)
                                .padding(.horizontal, 10)
                                .padding(.vertical, 5)
                                .background(
                                    voice.id == selectedVoiceID
                                        ? Color.accentColor.opacity(0.25)
                                        : Color.secondary.opacity(0.12),
                                    in: Capsule()
                                )
                        }
                        .buttonStyle(.plain)
                    }
                    Button(favourites.isEmpty ? "Pick voices" : "More") {
                        onOpenVoices()
                    }
                    .font(.caption)
                }
            }

            Spacer(minLength: 0)

            if let chapterTitle {
                Text(chapterTitle)
                    .font(.caption)
                    .lineLimit(1)
                    .foregroundStyle(.secondary)
            }
        }
    }

    private func speedLabel(_ rate: Double) -> String {
        let trimmed = rate == rate.rounded() ? String(Int(rate)) : String(format: "%g", rate)
        return "\(trimmed)\u{00D7}"
    }
}

func formatTime(_ seconds: TimeInterval) -> String {
    guard seconds.isFinite, seconds > 0 else { return "0:00" }
    let total = Int(seconds.rounded())
    let hours = total / 3600
    let minutes = (total % 3600) / 60
    let secs = total % 60
    if hours > 0 {
        return String(format: "%d:%02d:%02d", hours, minutes, secs)
    }
    return String(format: "%d:%02d", minutes, secs)
}
