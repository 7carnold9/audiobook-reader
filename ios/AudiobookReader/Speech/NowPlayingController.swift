import Foundation
import MediaPlayer

/// Lock screen, Control Centre, headset buttons and CarPlay.
///
/// The elapsed time and duration published here are the same estimates the
/// scrubber uses (`Timeline`), derived from word counts: speech synthesis has no
/// real timeline until it has been spoken, so the numbers are honest estimates
/// rather than measurements. Setting `MPNowPlayingInfoPropertyPlaybackRate` is
/// what makes the lock-screen clock move on its own between updates.
@MainActor
public final class NowPlayingController {
    public struct Actions {
        public var play: () -> Void
        public var pause: () -> Void
        public var skipForward: () -> Void
        public var skipBackward: () -> Void
        public var nextChapter: () -> Void
        public var previousChapter: () -> Void
        public var seek: (TimeInterval) -> Void

        public init(
            play: @escaping () -> Void,
            pause: @escaping () -> Void,
            skipForward: @escaping () -> Void,
            skipBackward: @escaping () -> Void,
            nextChapter: @escaping () -> Void,
            previousChapter: @escaping () -> Void,
            seek: @escaping (TimeInterval) -> Void
        ) {
            self.play = play
            self.pause = pause
            self.skipForward = skipForward
            self.skipBackward = skipBackward
            self.nextChapter = nextChapter
            self.previousChapter = previousChapter
            self.seek = seek
        }
    }

    public static let skipInterval: TimeInterval = 15

    private var isWired = false

    public init() {}

    public func wire(_ actions: Actions) {
        let center = MPRemoteCommandCenter.shared()

        center.playCommand.addTarget { _ in actions.play(); return .success }
        center.pauseCommand.addTarget { _ in actions.pause(); return .success }
        center.togglePlayPauseCommand.addTarget { _ in actions.play(); return .success }

        center.skipForwardCommand.preferredIntervals = [NSNumber(value: Self.skipInterval)]
        center.skipBackwardCommand.preferredIntervals = [NSNumber(value: Self.skipInterval)]
        center.skipForwardCommand.addTarget { _ in actions.skipForward(); return .success }
        center.skipBackwardCommand.addTarget { _ in actions.skipBackward(); return .success }

        // Track buttons move by chapter, which is what a headset click means in
        // an audiobook.
        center.nextTrackCommand.addTarget { _ in actions.nextChapter(); return .success }
        center.previousTrackCommand.addTarget { _ in actions.previousChapter(); return .success }

        center.changePlaybackPositionCommand.addTarget { event in
            guard let event = event as? MPChangePlaybackPositionCommandEvent else { return .commandFailed }
            actions.seek(event.positionTime)
            return .success
        }

        isWired = true
    }

    public func unwire() {
        guard isWired else { return }
        let center = MPRemoteCommandCenter.shared()
        for command in [
            center.playCommand, center.pauseCommand, center.togglePlayPauseCommand,
            center.skipForwardCommand, center.skipBackwardCommand,
            center.nextTrackCommand, center.previousTrackCommand,
            center.changePlaybackPositionCommand,
        ] {
            command.removeTarget(nil)
        }
        isWired = false
        MPNowPlayingInfoCenter.default().nowPlayingInfo = nil
    }

    public func update(
        title: String,
        author: String?,
        chapter: String?,
        elapsed: TimeInterval,
        duration: TimeInterval,
        rate: Double,
        isPlaying: Bool
    ) {
        let info: [String: Any] = [
            MPMediaItemPropertyTitle: chapter ?? title,
            MPMediaItemPropertyAlbumTitle: title,
            MPMediaItemPropertyArtist: author ?? "Audiobook Reader",
            MPMediaItemPropertyPlaybackDuration: duration,
            MPNowPlayingInfoPropertyElapsedPlaybackTime: elapsed,
            MPNowPlayingInfoPropertyPlaybackRate: isPlaying ? rate : 0,
            MPNowPlayingInfoPropertyDefaultPlaybackRate: rate,
            MPNowPlayingInfoPropertyMediaType: MPNowPlayingInfoMediaType.audio.rawValue,
            MPNowPlayingInfoPropertyIsLiveStream: false,
        ]
        MPNowPlayingInfoCenter.default().nowPlayingInfo = info
    }
}
