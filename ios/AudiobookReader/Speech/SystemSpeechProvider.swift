import AVFoundation
import Foundation

/// The on-device synthesizer.
///
/// Three things matter here and none of them have a web equivalent:
///
/// 1. `AVSpeechSynthesizer` queues natively, so `append` is free — the engine
///    plays a sentence that spans two chunks as one breath with no timer.
/// 2. `preUtteranceDelay` puts the narration's beats *inside* the audio graph,
///    so the audio session never goes idle during a pause.
/// 3. `usesApplicationAudioSession` is true by default, which is what lets the
///    app keep talking with the screen locked once `AudioSessionController` has
///    put the session into `.playback`. This is the whole reason the native app
///    exists.
public final class SystemSpeechProvider: NSObject, SpeechProvider {
    public let id = "system"
    public let name = "On-device voice"
    public let supportsBoundaries = true
    public let supportsQueueing = true
    public let honoursDelays = true

    public var isAvailable: Bool { !AVSpeechSynthesisVoice.speechVoices().isEmpty }

    private let synthesizer = AVSpeechSynthesizer()
    private var handles: [ObjectIdentifier: Handle] = [:]
    private var defaultVoiceIDsByLanguage: [String: String] = [:]

    public override init() {
        super.init()
        synthesizer.delegate = self
    }

    // MARK: Voices

    public func voices() async -> [Voice] {
        AVSpeechSynthesisVoice.speechVoices().map { voice in
            Voice(
                id: voice.identifier,
                name: voice.name,
                language: voice.language,
                isDefault: defaultVoiceID(for: voice.language) == voice.identifier,
                quality: Self.quality(of: voice)
            )
        }
    }

    private func defaultVoiceID(for language: String) -> String? {
        if let cached = defaultVoiceIDsByLanguage[language] { return cached }
        // `AVSpeechSynthesisVoice(language:)` is the platform's own pick for a
        // language; there is no `isDefault` flag on the voice itself.
        guard let identifier = AVSpeechSynthesisVoice(language: language)?.identifier else {
            return nil
        }
        defaultVoiceIDsByLanguage[language] = identifier
        return identifier
    }

    private static func quality(of voice: AVSpeechSynthesisVoice) -> VoiceQuality {
        switch voice.quality {
        case .enhanced: return .enhanced
        case .premium: return .premium
        default: return .standard
        }
    }

    // MARK: Speaking

    @discardableResult
    public func speak(_ request: SpeechRequest) -> SpeechHandle {
        let utterance = AVSpeechUtterance(string: request.text)
        if let voiceID = request.voiceID {
            utterance.voice = AVSpeechSynthesisVoice(identifier: voiceID)
        }
        utterance.rate = Self.utteranceRate(for: request.rate)
        utterance.preUtteranceDelay = request.preDelay
        utterance.postUtteranceDelay = 0

        let handle = Handle(provider: self, utterance: utterance, request: request)

        if !request.append {
            // AVSpeechSynthesizer always queues, so interrupting means stopping
            // first. Everything already in flight is marked cancelled so its
            // `didCancel` does not look like a natural end.
            for existing in handles.values { existing.isCancelled = true }
            handles.removeAll()
            synthesizer.stopSpeaking(at: .immediate)
        }

        handles[ObjectIdentifier(utterance)] = handle
        synthesizer.speak(utterance)
        return handle
    }

    /// Maps a narrator-speed multiplier (1.0 = the voice's normal pace) onto
    /// `AVSpeechUtterance.rate`, whose scale runs 0...1 with 0.5 as normal.
    ///
    /// GUESS: this curve is monotonic and hits the documented end points, but
    /// the perceptual result has not been checked on a device — expect to tune
    /// the upper half once you can hear it.
    static func utteranceRate(for multiplier: Double) -> Float {
        let normal = Double(AVSpeechUtteranceDefaultSpeechRate)
        let minimum = Double(AVSpeechUtteranceMinimumSpeechRate)
        let maximum = Double(AVSpeechUtteranceMaximumSpeechRate)
        let clamped = min(3.0, max(0.5, multiplier))
        if clamped <= 1 {
            return Float(minimum + (normal - minimum) * clamped)
        }
        return Float(normal + (maximum - normal) * (clamped - 1) / 2)
    }

    // MARK: Handles

    fileprivate final class Handle: SpeechHandle {
        weak var provider: SystemSpeechProvider?
        let utterance: AVSpeechUtterance
        let request: SpeechRequest
        var isCancelled = false
        var hasEnded = false

        init(provider: SystemSpeechProvider, utterance: AVSpeechUtterance, request: SpeechRequest) {
            self.provider = provider
            self.utterance = utterance
            self.request = request
        }

        func stop() {
            isCancelled = true
            provider?.cancel(self)
        }

        func pause() {
            provider?.synthesizer.pauseSpeaking(at: .word)
        }

        func resume() {
            provider?.synthesizer.continueSpeaking()
        }
    }

    fileprivate func cancel(_ handle: Handle) {
        handles.removeValue(forKey: ObjectIdentifier(handle.utterance))
        // There is no per-utterance cancel: stopping drops the whole queue, and
        // `Narration.stop()` calls `stop()` on every outstanding handle anyway.
        if handles.isEmpty {
            synthesizer.stopSpeaking(at: .immediate)
        }
    }

    private func handle(for utterance: AVSpeechUtterance) -> Handle? {
        handles[ObjectIdentifier(utterance)]
    }

    private func finish(_ utterance: AVSpeechUtterance, cancelled: Bool) {
        guard let handle = handles.removeValue(forKey: ObjectIdentifier(utterance)) else { return }
        guard !handle.hasEnded else { return }
        handle.hasEnded = true
        // A cancelled utterance is one the caller threw away; it is not an end.
        guard !cancelled, !handle.isCancelled else { return }
        handle.request.onEnd(nil)
    }

    /// Delegate callbacks are not documented to arrive on any particular queue,
    /// and `Narration` is main-thread-only, so they are funnelled here.
    private func onMain(_ work: @escaping () -> Void) {
        if Thread.isMainThread { work() } else { DispatchQueue.main.async(execute: work) }
    }
}

extension SystemSpeechProvider: AVSpeechSynthesizerDelegate {
    public func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didStart utterance: AVSpeechUtterance
    ) {
        onMain { [weak self] in
            guard let handle = self?.handle(for: utterance), !handle.isCancelled else { return }
            handle.request.onStart?()
        }
    }

    public func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        willSpeakRangeOfSpeechString characterRange: NSRange,
        utterance: AVSpeechUtterance
    ) {
        onMain { [weak self] in
            guard let handle = self?.handle(for: utterance), !handle.isCancelled else { return }
            // `characterRange.location` is a UTF-16 offset, which is exactly what
            // `SpeechText.words` records.
            handle.request.onBoundary?(characterRange.location)
        }
    }

    public func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didFinish utterance: AVSpeechUtterance
    ) {
        onMain { [weak self] in self?.finish(utterance, cancelled: false) }
    }

    public func speechSynthesizer(
        _ synthesizer: AVSpeechSynthesizer,
        didCancel utterance: AVSpeechUtterance
    ) {
        onMain { [weak self] in self?.finish(utterance, cancelled: true) }
    }
}
