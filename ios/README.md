# Audiobook Reader for iOS

> **None of this has ever been compiled.**
>
> It was written on a Linux container with no Xcode, no iOS SDK and no Swift
> toolchain — `which swift` finds nothing, so not one line here has been through
> a compiler, a simulator or a device. There are no test results in this
> directory and no claim that anything builds. Treat it as a careful, complete
> first draft that a developer opens on a Mac and compiles for the first time.
> Expect to spend a session fixing type errors and PDFKit surprises before it
> runs. See **What to expect on the first build** at the bottom.

A native port of the web app in the repository root: open a PDF, extract and
clean its text, narrate it with audiobook controls.

## Why this exists

One reason, above all the others: **the web version stops talking when the
screen locks.** A browser tab's speech synthesis is suspended along with the
page, which makes the web app useless for the thing an audiobook is for —
listening with the phone in a pocket. An iOS app with the `audio` background
mode and an `AVAudioSession` in `.playback` keeps going with the screen off, on
the lock screen, over Bluetooth and through a route change.

The rest follows from being native: `AVSpeechUtterance.preUtteranceDelay` puts
the narration's beats inside the audio graph instead of inside a JavaScript
timer, `MPRemoteCommandCenter` gives headset and CarPlay controls, and
`speechSynthesizer(_:willSpeakRangeOfSpeechString:utterance:)` reports word
boundaries for the highlighting.

## Opening it in Xcode

There is no `.xcodeproj` checked in — it is generated from `project.yml`:

```bash
brew install xcodegen          # once
cd ios
xcodegen generate              # writes AudiobookReader.xcodeproj and Info.plist
open AudiobookReader.xcodeproj
```

Then set your own team under **Signing & Capabilities** (the spec uses the
placeholder bundle id `com.example.AudiobookReader`) and run on an iOS 17
device or simulator. `⌘U` runs the unit tests.

`AudiobookReader.xcodeproj` and `AudiobookReader/Info.plist` are build products.
Regenerate them; do not edit them.

The one capability that has to be right is **Background Modes → Audio**.
`project.yml` writes `UIBackgroundModes: [audio]` into the Info.plist, and
Xcode will show it as a capability once the project is generated. Without it the
app stops speaking at lock, exactly like the web version.

## Layout

The Swift mirrors the TypeScript file for file, so the two can be diffed when a
heuristic is changed on either side.

| Swift | Ported from |
| --- | --- |
| `PDF/PDFTypes.swift` | `src/lib/pdf/types.ts` |
| `PDF/Lines.swift` | `src/lib/pdf/lines.ts` |
| `PDF/Clean.swift` | `src/lib/pdf/clean.ts` |
| `PDF/Chunker.swift` | `src/lib/pdf/chunk.ts` |
| `PDF/Chapters.swift` | `src/lib/pdf/chapters.ts` |
| `PDF/Ingest.swift` | `src/lib/pdf/ingest.ts` |
| `PDF/PDFExtractor.swift` | `src/lib/pdf/extract.ts` (pdf.js → PDFKit) |
| `PDF/TextScanning.swift` | the regular expressions, rewritten as scans |
| `Text/SpeechNormalizer.swift` | `src/lib/text/normalize.ts` |
| `Speech/Narration.swift` | `src/state/narration.ts` |
| `Speech/Timeline.swift` | `buildTimeline`/`chunkAtSeconds` in `src/state/usePlayer.ts` |
| `Speech/PlayerModel.swift` | the rest of `src/state/usePlayer.ts` |
| `Speech/SpeechProvider.swift` | `src/lib/tts/types.ts` |
| `Speech/SystemSpeechProvider.swift` | `src/lib/tts/webSpeech.ts` |
| `Speech/VoiceCatalog.swift` | `src/lib/tts/favourites.ts` |
| `Speech/AudioSessionController.swift`, `Speech/NowPlayingController.swift` | `src/state/useMediaSession.ts`, expanded |
| `Storage/` | `src/lib/storage/db.ts` (IndexedDB → `Codable` + `FileManager`) |
| `Views/`, `App/` | `src/components/`, `src/App.tsx` |

The tests in `AudiobookReaderTests/` are XCTest ports of `src/lib/pdf/*.test.ts`,
`src/lib/text/normalize.test.ts`, `src/state/narration.test.ts`,
`src/state/timeline.test.ts` and `src/lib/tts/favourites.test.ts`, case for case.
They are how you will know the port is faithful once it compiles — run them
first, before the app.

## What is done

**Extraction and cleaning — ported in full.** The 3.5em gutter rule, the empty
vertical gutter search, spanning-block handling, repeated header and footer
removal with digits masked so page numbers match, footnote removal by font size
and page position, de-hyphenation, paragraph-break detection including
continuation across page and column breaks, and heading detection by font size
against the page's text width. Sentence splitting with the abbreviation, initial
and decimal exceptions, ~320-character packing, chapters from the outline with a
heading fallback.

**Speech normalization — ported in full,** including the alignment map that
keeps every spoken word pointing at the display token it came from. Offsets are
UTF-16, so an `NSRange` from the synthesizer maps onto a token with no
re-indexing.

**The narration schedule — ported in full,** with the same numbers: 220ms after
a sentence, 460ms between paragraphs, 900ms before a heading, 650ms after one,
headings at 0.94×, a sentence that runs across a chunk boundary never broken,
and never starting a new utterance while paused.

**Background audio, lock screen and remote commands.** `.playback` +
`.spokenAudio` + `.longFormAudio`, `MPNowPlayingInfoCenter`,
`MPRemoteCommandCenter` with play/pause, ±15s, chapter skip and scrubbing, and
handling for interruptions (a phone call) and route loss (headphones out).

**The UI**: library with import and progress, reader with the transcript and the
spoken word highlighted and tappable, player bar (play/pause, ±15s, speed,
bookmark, scrubber), chapter list, bookmarks, and a voice picker over
`AVSpeechSynthesisVoice.speechVoices()` with preview and a six-voice shortlist.

**Persistence**: `Codable` over `FileManager`, one directory per book. Local
only; no accounts, no network.

## What is stubbed, missing or unverified

- **No `SpeechProvider` but the on-device one.** The protocol is the seam the
  web app's `TtsProvider` was, so a cloud voice drops in later, but nothing
  implements it yet and there is no audio cache — `SpeechRequest.cacheKey` is
  computed and carried and then ignored, ready for a provider that wants it.
- **No OCR.** A scanned PDF produces no text and is rejected with a message
  saying so, same as the web app.
- **Page rotation is not handled** in the extractor. A page with
  `/Rotate 90` will produce nonsense coordinates.
- **No app icon, no launch image, no localization.**
- **Import is one file at a time** and does not handle being opened *from*
  another app yet — the document type is declared in the Info.plist but nothing
  implements `onOpenURL`.
- **`estimateSeconds` drives the scrubber and the lock-screen clock.** Speech
  has no real timeline until it has been spoken, so the position is an estimate
  at 165 words per minute. It drifts. Measuring actual utterance durations and
  correcting the timeline as the book is read is the obvious next improvement.
- **Nothing has been profiled.** See the performance note below.

## Decisions I had to guess at

These are the places where I could not check the answer, in rough order of how
likely they are to bite.

1. **Getting positions out of PDFKit.** PDFKit has no equivalent of pdf.js's
   `TextItem`, so `PDFExtractor` walks `PDFPage.characterBounds(at:)` one
   character at a time and merges the results into word-sized runs, which
   `groupIntoLines` then assembles into lines exactly as it does on the web.

   I deliberately did **not** use `PDFPage.selection(for:)` +
   `selectionsByLine()`. Those give you PDFKit's idea of a line, and PDFKit is
   perfectly capable of running a "line" straight across a two-column gutter —
   which is the precise failure the 3.5em rule in `lines.ts` exists to prevent.
   Feeding PDFKit's lines into the pipeline would throw away the heuristic that
   the whole port is about. The character-bounds route keeps the raw geometry
   and lets the ported rule do its job.

   **What I could not verify:** whether `characterBounds(at:)` indexes by UTF-16
   unit (assumed), whether it agrees with `page.string` in length (checked at
   runtime, with a fallback), and whether it returns sane rects for whitespace
   (assumed not, so whitespace is dropped and word spacing is reconstructed from
   the geometry). If extraction comes out garbled, this function is where to
   look first — `PDFTextExtractor.textRuns(from:origin:)`.

2. **Font size.** `RawLine.fontSize` drives heading detection, footnote removal
   and the body-text median, so it matters. The extractor prefers the point size
   from the `.font` attribute of `PDFPage.attributedString`, and falls back to
   the height of the glyph's bounding box when the attributed string does not
   line up with `page.string`. The glyph box over-reports by the leading, which
   inflates sizes uniformly — the ratios the heuristics use (1.18× for a
   heading, 0.86× for a footnote) should survive that, but it is untested.

3. **Baseline y.** `RawLine.y` is the *bottom* of the glyph box, not the true
   baseline. Everything downstream compares y values on the same page, so a
   constant offset is harmless; it would matter only if fonts of very different
   descender depths shared a line.

4. **Coordinates are crop-box relative.** `characterBounds` is in page space,
   which need not start at the origin, so the extractor subtracts the crop box
   origin. Otherwise "is this line in the top 8% of the page?" means nothing.

5. **Speech rate.** `AVSpeechUtterance.rate` runs 0...1 with 0.5 as normal, and
   the mapping from a "1.5×" narrator multiplier onto it is not linear or
   documented. `SystemSpeechProvider.utteranceRate(for:)` uses a piecewise curve
   that is monotonic and hits the documented end points. It will very likely
   need tuning by ear.

6. **`preUtteranceDelay` versus a timer.** This is the one place the port
   deliberately diverges. `SpeechProvider.honoursDelays` says whether the engine
   renders its own silences. When it does — as `AVSpeechSynthesizer` does —
   `Narration` queues the next sentence immediately with the beat attached as
   `preUtteranceDelay`, instead of waiting on a timer and then speaking. The
   audio session never goes idle mid-pause and the next sentence starts with no
   warm-up. When it does not, `Narration` falls back to the web app's timer,
   which is the path every ported test exercises; two extra tests cover the
   native path. The lookahead is capped at 3 either way.

   **Unverified:** whether `preUtteranceDelay` on a *queued* utterance is
   honoured as reliably as on a leading one. If the beats come out wrong on
   device, set `honoursDelays` to `false` on `SystemSpeechProvider` and the
   timer path takes over with no other change.

7. **Pausing.** `AVSpeechSynthesizer.pauseSpeaking(at: .word)` pauses the whole
   queue, not one utterance, so every handle's `pause()` routes to the same
   synthesizer. The web app's "never start an utterance while paused" guard is
   kept anyway: it costs nothing and the failure it prevents is silent.

8. **Cancellation.** There is no per-utterance cancel — `stopSpeaking(at:)`
   drops the whole queue — so the provider marks outstanding handles as
   cancelled before stopping, and a `didCancel` for a cancelled handle is not
   reported as a natural end. Getting this wrong makes the narration skip
   sentences after a seek, so it is worth a look under the debugger.

9. **Delegate threading.** `AVSpeechSynthesizerDelegate` callbacks are not
   documented to arrive on any particular queue, and `Narration` is
   main-thread-only, so the provider funnels them through `onMain`, calling
   straight through when already on the main thread to preserve ordering.

10. **Regular expressions became scans.** The TypeScript leans on regexes
    throughout; the Swift implements them as explicit character scans in
    `TextScanning.swift` and alongside each user. A mistyped `NSRegularExpression`
    pattern fails at runtime, a mistyped scan fails to compile, and on a hot loop
    over every character of a book the scan is cheaper. Each one carries the
    original pattern in a comment. **This is the most likely place for a
    behavioural divergence** — the ported tests are the check.

11. **String lengths.** JavaScript counts UTF-16 units; the Swift counts
    `Character`s for chunk sizing and `Character`s for hit-testing, but UTF-16
    for speech offsets (to match `NSRange`). For Latin text these agree. For a
    book full of emoji or combining marks the chunk boundaries would differ
    slightly from the web app's. Harmless, but it means chunk indices are not
    portable between the two implementations.

12. **The gutter sweep.** `findGutter` steps an integer 0...30 rather than
    accumulating `0.01` in a float, so it always evaluates 31 candidate columns;
    the JavaScript's accumulated drift may evaluate 30. The difference is a
    gutter position 0.01 of a page-width apart, which no downstream test can see.

13. **Sort stability.** `Array.sorted(by:)` is not guaranteed stable in Swift
    and the pipeline sorts on keys with frequent ties (same baseline, same x).
    Every comparator in the port falls back to the original index so the results
    are deterministic and match the JavaScript's stable sort.

14. **Chapter titles from the outline.** PDFKit exposes a bookmark's target as
    either `destination` or a `PDFActionGoTo`; the extractor tries both and
    treats an unresolvable bookmark as `page: nil`, which is what the web app
    does when pdf.js cannot resolve a destination.

## Performance

`characterBounds(at:)` is one Objective-C call per character. A dense page is a
couple of thousand characters, a four-hundred-page book most of a million calls.
The ingest already runs off the main actor, so the UI stays responsive, but if
importing a long book is slow this is the thing to measure first. If it is too
slow, the fix is probably to batch through `PDFSelection` per line and fall back
to per-character bounds only where a line looks like it crosses a gutter — which
trades some faithfulness for speed, so measure before doing it.

## What to expect on the first build

Nothing here has seen a compiler. Budget for:

- **Type and API errors.** Method signatures were written from memory of the
  PDFKit, AVFoundation and MediaPlayer APIs. Expect a handful of wrong labels.
- **Concurrency diagnostics.** The spec sets `SWIFT_STRICT_CONCURRENCY: minimal`
  on purpose. Turning it up will surface real work around the non-`Sendable`
  provider and store.
- **`@Observable` and SwiftUI specifics** — `navigationDestination(item:)`,
  `ContentUnavailableView`, the custom `Layout` in `TranscriptView` — all iOS 17
  APIs used from memory.
- **Then run the tests before the app.** They cover the parts that are actually
  valuable — the heuristics — and they need nothing but the pure logic, so they
  are the fastest way to find out whether the port is faithful or whether a
  scan-for-regex translation went wrong.
