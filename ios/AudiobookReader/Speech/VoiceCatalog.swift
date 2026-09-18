import Foundation

/// How many voices can sit on the shortlist. The point of the shortlist is to
/// replace a hundred-entry picker with a row of buttons, so it stays small
/// enough to fit in the player bar.
public let maxFavouriteVoices = 6

/// Adds or removes a voice, ignoring additions once the shortlist is full.
public func toggleFavourite(_ favourites: [String], _ id: String) -> [String] {
    if favourites.contains(id) { return favourites.filter { $0 != id } }
    guard favourites.count < maxFavouriteVoices else { return favourites }
    return favourites + [id]
}

/// The shortlisted voices, in the order they were starred, skipping any the
/// platform no longer offers (a downloaded voice can be deleted in Settings).
public func shortlist(_ voices: [Voice], favourites: [String]) -> [Voice] {
    favourites.compactMap { id in voices.first { $0.id == id } }
}

/// Matches the query against both the voice name and its language tag.
public func searchVoices(_ voices: [Voice], query: String) -> [Voice] {
    let needle = query.trimmingCharacters(in: .whitespacesAndNewlines).lowercased()
    guard !needle.isEmpty else { return voices }
    return voices.filter {
        $0.name.lowercased().contains(needle) || $0.language.lowercased().contains(needle)
    }
}

/// Puts the voices worth trying first: shortlisted ones, then the platform
/// defaults for the reader's own language, then everything else grouped by
/// language.
public func orderVoices(_ voices: [Voice], favourites: [String], language: String) -> [Voice] {
    let prefix = String(language.prefix(2)).lowercased()

    func rank(_ voice: Voice) -> Int {
        if let starred = favourites.firstIndex(of: voice.id) { return starred }
        let local = voice.language.lowercased().hasPrefix(prefix)
        if local && voice.isDefault { return maxFavouriteVoices + 1 }
        if local { return maxFavouriteVoices + 2 }
        return maxFavouriteVoices + 3
    }

    return voices.sorted { left, right in
        let (a, b) = (rank(left), rank(right))
        if a != b { return a < b }
        if left.language != right.language { return left.language < right.language }
        return left.name < right.name
    }
}
