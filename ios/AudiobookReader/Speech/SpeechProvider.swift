import Foundation

public enum VoiceQuality: Int, Comparable, Codable, Sendable {
    case standard = 0
    case enhanced = 1
    case premium = 2

    public static func < (lhs: VoiceQuality, rhs: VoiceQuality) -> Bool {
        lhs.rawValue < rhs.rawValue
    }
}

public struct Voice: Identifiable, Equatable, Hashable, Sendable {
    public var id: String
    public var name: String
    /// BCP-47 language tag, e.g. `en-GB`.
    public var language: String
    /// True for the voice the platform considers the default for its language.
    public var isDefault: Bool
    public var quality: VoiceQuality

    public init(
        id: String,
        name: String,
        language: String,
        isDefault: Bool = false,
        quality: VoiceQuality = .standard
    ) {
        self.id = id
        self.name = name
        self.language = language
        self.isDefault = isDefault
        self.quality = quality
    }
}

/// One request to say something.
///
/// `preDelay` is the silence owed *before* this utterance. A provider that sets
/// `honoursDelays` renders it itself — on Apple platforms that is
/// `AVSpeechUtterance.preUtteranceDelay`, which keeps the beat inside the audio
/// graph instead of inside a timer, so the session never goes idle mid-pause
/// and the next sentence starts with no warm-up. A provider that cannot do that
/// leaves `preDelay` alone and `Narration` times the silence instead.
public struct SpeechRequest {
    public var text: String
    /// Playback speed as a multiplier, where 1.0 is the narrator's normal pace.
    public var rate: Double
    public var voiceID: String?
    /// Queue behind whatever is already speaking instead of interrupting it.
    /// This is what lets a sentence split across chunks play as one breath.
    public var append: Bool
    public var preDelay: TimeInterval
    /// Stable key for caching synthesized audio, e.g. `<bookID>:<chunkIndex>`.
    public var cacheKey: String
    /// Fires when this request actually begins speaking, which may be after a
    /// queued wait.
    public var onStart: (() -> Void)?
    /// UTF-16 offset into `text` of the word being spoken, when supported.
    public var onBoundary: ((Int) -> Void)?
    public var onEnd: (Error?) -> Void

    public init(
        text: String,
        rate: Double,
        voiceID: String?,
        append: Bool,
        preDelay: TimeInterval = 0,
        cacheKey: String = "",
        onStart: (() -> Void)? = nil,
        onBoundary: ((Int) -> Void)? = nil,
        onEnd: @escaping (Error?) -> Void
    ) {
        self.text = text
        self.rate = rate
        self.voiceID = voiceID
        self.append = append
        self.preDelay = preDelay
        self.cacheKey = cacheKey
        self.onStart = onStart
        self.onBoundary = onBoundary
        self.onEnd = onEnd
    }
}

public protocol SpeechHandle: AnyObject {
    func stop()
    func pause()
    func resume()
}

/// The seam between the narration schedule and whatever actually makes noise.
///
/// The on-device synthesizer is the only implementation that ships, but the
/// protocol is the point: a cloud voice becomes a second conformer with
/// `supportsBoundaries == false` (it would highlight by estimate rather than by
/// callback) and the player never learns the difference.
public protocol SpeechProvider: AnyObject {
    var id: String { get }
    var name: String { get }
    /// Whether the provider reports word boundaries, which drives highlighting.
    var supportsBoundaries: Bool { get }
    /// Whether `append` is honoured, i.e. requests can be queued seamlessly.
    var supportsQueueing: Bool { get }
    /// Whether `SpeechRequest.preDelay` is rendered by the engine.
    var honoursDelays: Bool { get }
    var isAvailable: Bool { get }
    func voices() async -> [Voice]
    @discardableResult func speak(_ request: SpeechRequest) -> SpeechHandle
}
