# Outstanding work

State as of 18 Sep 2026. The web app works end to end for PDF and EPUB —
ingest, clean, chunk, narrate, bookmark, resume — so everything here is the gap
between "works" and "something you'd use every day".

Ordered by what unblocks the most, not by effort.

## Waiting on a decision

- [ ] **Listen to a real book end to end.** Still the highest-value item. The
      audio path is verified structurally and has never been heard here, so the
      pause lengths (220ms after a sentence, 460ms between paragraphs, 900/650ms
      around a heading) and the 0.94× heading slowdown are all picked blind.
- [ ] **Web forever, or iOS?** There is now an unbuilt iOS port in `ios/`, so
      the decision has a real cost either way: finish it (about a day on a Mac
      to first run) or delete it before it rots.
- [ ] **Pick a cloud TTS provider and a per-book budget ceiling.** The costing
      is done — roughly $8 a novel at mainstream neural pricing — and is written
      up on the Pricing & Paywall stage in Notion.
- [ ] **Decide whether a hosted copy should exist** (GitHub Pages, Vercel, or
      local only).

## Functional gaps

- [ ] **iOS Safari is untested**, and it is the likeliest place to listen. Web
      Speech stops when the screen locks. This is the strongest argument for the
      native port, where `AVAudioSession` and the now-playing controls solve it
      properly.
- [ ] **No search inside a book, and no jump-to-page.** The transcript is
      windowed to ±120 chunks, so a half-remembered passage is unfindable.
- [ ] **No sleep timer.** Table stakes for listening in bed.
- [ ] **The audio cache is invisible.** The size is computed and never shown;
      once cloud voices are on, a few books is hundreds of megabytes with no way
      to see or clear it.
- [ ] **Changing speed restarts the current sentence** (the Web Speech API
      cannot change rate mid-utterance). Applying it at the next sentence
      boundary would be smoother.
- [ ] **The voice shortlist is one global list** shared by every engine, even
      though the chosen voice is now per book.
- [ ] **A deleted book leaves its `voice:<bookId>` setting behind.** Harmless,
      one line to sweep in `deleteBook`.
- [ ] **EPUB positions read as sections, not pages**, which is honest but coarse
      — a long section gives a vague sense of place.
- [ ] **No cover art.** PDFs could render page 1; EPUBs carry a real cover image
      that is currently ignored.

## Narration quality

- [ ] **Delivery is tuned by guess, not by ear.** See the first item.
- [ ] **De-hyphenation joins real compounds** (`key-value` → `keyvalue`). Needs
      a dictionary, or a rule that keeps the hyphen when both halves are words.
      PDF only; EPUB is unaffected.
- [ ] **Tables are read cell by cell**, row by row. PDF only — EPUB tables are
      skipped outright, which is its own kind of wrong.
- [ ] **Equations are read symbol by symbol.** Operators and Greek letters are
      named; fractions and subscripts are not.
- [ ] **Only two-column PDF layouts are detected.** Three-column and rotated
      pages fall back to single-column order, which reads as nonsense.
- [ ] **The PDF footnote heuristic is blunt** — small type in the bottom 28% of
      a page. A book with small body text loses real prose.
- [ ] **No chapter detection** for a PDF with neither bookmarks nor styled
      headings.

## Cloud voices

- [ ] **Stand up the `/api/tts` endpoint.** The client provider is written and
      has never spoken to a live one.
- [ ] **Measure the real cost of one full book** before turning it on.
- [ ] **Pre-synthesize the next sentence while the current one plays.** System
      voices queue seamlessly; cloud voices cannot yet, so they will gap.
- [ ] **Sentence-level highlight fallback** — cloud audio carries no word
      timings.
- [ ] **Cache eviction policy**, paired with the visible cache size above.

## Housekeeping

- [ ] **No CI.** A workflow running typecheck, tests and build on push.
- [ ] **No LICENSE file.**
- [ ] **No error boundary** — a render crash blanks the page.
- [ ] **No `.env.example`** documenting the `VITE_TTS_*` variables.
- [ ] **Storage-quota failures surface as raw error strings.**
- [ ] **Dead export:** the audio-cache size helper is written and never called.

## iOS port (`ios/`)

- [ ] **Compile it.** 41 Swift files, ~4,700 lines, never built — no Xcode in
      the environment it was written in. Expect half a day of compile errors:
      the PDFKit and AVFoundation signatures were written from memory.
- [ ] **Run the ported tests first** — nine XCTest files covering the pure
      logic. They are the fastest check that the port is faithful.
- [ ] **Verify `PDFPage.characterBounds(at:)`**, the riskiest assumption in the
      port, and measure it: one call per character is ~1M calls for a 400-page
      book.
- [ ] **Tune `AVSpeechUtterance.rate`** — the mapping curve is a guess.

## Parked

- [ ] **OCR for scanned PDFs** (Tesseract). Detected and refused today.
- [ ] **Accounts and cross-device sync.** Everything is local-first.

## Done since this list was written

- [x] Continuous narration with deliberate pauses, and the pause bug where
      playback resumed itself.
- [x] Click any word to start reading from there.
- [x] Bookmarks, stored to the exact word, listed in the sidebar.
- [x] Per-book voice, falling back to a global default.
- [x] A speed slider with clickable marks at the common speeds.
- [x] The reader and library rebuilt to the reference layouts, dark-only, with
      voices in a slide-out drawer and a "back to current" pill.
- [x] EPUB support: a zip reader and markup tokenizer, the package document,
      spine, and EPUB 3 nav or EPUB 2 NCX chapters.
