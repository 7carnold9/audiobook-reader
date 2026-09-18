import Foundation

/// An estimated running time for a book, so the scrubber and the lock screen
/// have something to show before a single word has been synthesized.
public struct Timeline: Equatable, Sendable {
    /// Estimated start time of each chunk at rate 1, in seconds.
    public var starts: [Double]
    public var durations: [Double]
    public var total: Double

    public init(starts: [Double] = [], durations: [Double] = [], total: Double = 0) {
        self.starts = starts
        self.durations = durations
        self.total = total
    }
}

public func buildTimeline(_ chunks: [Chunk]) -> Timeline {
    var starts: [Double] = []
    var durations: [Double] = []
    var total: Double = 0
    for chunk in chunks {
        let duration = estimateSeconds(wordCount: Scan.words(chunk.text).count)
        starts.append(total)
        durations.append(duration)
        total += duration
    }
    return Timeline(starts: starts, durations: durations, total: total)
}

/// The chunk playing at `seconds`, clamped to the book.
public func chunkAtSeconds(_ timeline: Timeline, _ seconds: Double) -> Int {
    var low = 0
    var high = timeline.starts.count - 1
    var best = 0
    while low <= high {
        let mid = (low + high) / 2
        if timeline.starts[mid] <= seconds {
            best = mid
            low = mid + 1
        } else {
            high = mid - 1
        }
    }
    return best
}
