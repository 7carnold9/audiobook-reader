import AVFoundation
import Foundation

/// Owns the app's audio session.
///
/// This is the single biggest reason the native app exists: the web version
/// stops talking the moment the screen locks, because a browser tab's speech
/// synthesis is suspended with the page. An iOS app that sets its session to
/// `.playback` and declares the `audio` background mode keeps going with the
/// screen off, on the lock screen, over Bluetooth, and through a route change.
///
/// - `.playback` is the category that plays while the ringer switch is silent
///   and while the device is locked.
/// - `.spokenAudio` mode is the right mode for narration: it makes other spoken
///   audio (navigation prompts, podcasts) *pause* rather than duck, which is
///   what a listener expects from an audiobook.
/// - `.longFormAudio` routing policy makes the app eligible for AirPlay 2 and
///   marks it as long-form content.
@MainActor
public final class AudioSessionController {
    public static let shared = AudioSessionController()

    /// Called when the system interrupts playback (a phone call) and when the
    /// interruption ends with a hint that playback should resume.
    public var onInterruption: ((Bool) -> Void)?
    /// Called when the route changes in a way that should pause — headphones out.
    public var onRouteLoss: (() -> Void)?

    private var isObserving = false

    private init() {}

    public func activate() throws {
        let session = AVAudioSession.sharedInstance()
        try session.setCategory(.playback, mode: .spokenAudio, policy: .longFormAudio)
        try session.setActive(true)
        observe()
    }

    public func deactivate() {
        try? AVAudioSession.sharedInstance().setActive(
            false,
            options: .notifyOthersOnDeactivation
        )
    }

    private func observe() {
        guard !isObserving else { return }
        isObserving = true
        let center = NotificationCenter.default

        center.addObserver(
            forName: AVAudioSession.interruptionNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] note in
            guard let info = note.userInfo,
                  let raw = info[AVAudioSessionInterruptionTypeKey] as? UInt,
                  let type = AVAudioSession.InterruptionType(rawValue: raw)
            else { return }

            switch type {
            case .began:
                MainActor.assumeIsolated { self?.onInterruption?(false) }
            case .ended:
                let optionsRaw = info[AVAudioSessionInterruptionOptionKey] as? UInt ?? 0
                let options = AVAudioSession.InterruptionOptions(rawValue: optionsRaw)
                MainActor.assumeIsolated { self?.onInterruption?(options.contains(.shouldResume)) }
            @unknown default:
                break
            }
        }

        center.addObserver(
            forName: AVAudioSession.routeChangeNotification,
            object: AVAudioSession.sharedInstance(),
            queue: .main
        ) { [weak self] note in
            guard let raw = note.userInfo?[AVAudioSessionRouteChangeReasonKey] as? UInt,
                  let reason = AVAudioSession.RouteChangeReason(rawValue: raw),
                  reason == .oldDeviceUnavailable
            else { return }
            MainActor.assumeIsolated { self?.onRouteLoss?() }
        }
    }
}
