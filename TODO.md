# Outstanding work

State as of 18 Sep 2026. The MVP works end to end — ingest, clean, chunk,
narrate, resume — so everything here is the gap between "works" and "something
you'd use every day".

Ordered by what unblocks the most, not by effort.

## Waiting on a decision

- [ ] **Listen to a real book end to end.** Nothing below matters as much as
      this. The whole audio path is verified structurally and has never been
      heard. Judge two things: whether chunk boundaries sound like natural
      pauses or stutters, and whether ~320 characters is the right chunk size.
- [ ] **Web forever, or iOS eventually?** It changes what to invest in. Web
      means working around background-audio limits; iOS means porting
      extraction to PDFKit and narration to AVSpeechSynthesizer, where those
      limits don't exist.
- [ ] **Pick a cloud TTS provider and a per-book budget ceiling.** A 300-page
      novel is roughly 600k characters, which is a real bill at per-character
      pricing.
- [ ] **Decide whether a hosted copy should exist** (GitHub Pages, Vercel, or
      nothing — local only).

## Functional gaps

- [ ] **iOS Safari is completely untested**, and it is the likeliest place to
      listen. Web Speech stops when the screen locks or the tab backgrounds,
      which is the "long-running playback" problem flagged at the start. Test
      first, then decide whether it can be worked around or whether it forces
      the native path.
- [ ] **No search inside a book, and no jump-to-page.** The transcript is
      windowed to ±120 chunks around the position, so there is no way to find a
      passage you remember.
- [ ] **No sleep timer.** Table stakes for listening in bed.
- [ ] **No bookmarks.** Position is saved automatically, but there is no way to
      mark a passage and come back to it.
- [ ] **The audio cache is invisible.** `audioCacheSize` is implemented and
      never shown; once cloud voices are on, a few books across a few voices is
      hundreds of megabytes with no way to see or clear it.
- [ ] **Changing speed restarts the current chunk** (the Web Speech API cannot
      change rate mid-utterance). Applying the change at the next chunk
      boundary instead would feel better.
- [ ] **The voice shortlist is one global list.** With a cloud engine added, its
      voices and the system voices share six slots and the starred ones simply
      vanish from the bar when you switch engine.
- [ ] **The library is a plain list** — no covers, no sorting, no search. Fine
      for five books, not for fifty.

## Narration quality

- [ ] **De-hyphenation joins real compounds.** A line ending `key-` followed by
      `value` becomes `keyvalue`. Needs a dictionary check, or a rule that keeps
      the hyphen when both halves are words on their own.
- [ ] **Tables are read cell by cell**, row by row. Honest, rarely pleasant.
      There should at least be an option to skip them.
- [ ] **Equations are read symbol by symbol.** Operators and Greek letters are
      named; fractions, subscripts and superscripts are not.
- [ ] **Only two-column layouts are detected.** Three-column and rotated or
      landscape pages fall back to single-column order, which reads as
      nonsense.
- [ ] **The footnote heuristic is blunt** — small type in the bottom 28% of a
      page. A book that sets its body text small, or puts a pull quote low on
      the page, loses real text.
- [ ] **No chapter detection** for documents with neither bookmarks nor styled
      headings — a plain-text export gets one chapter for the whole book.
- [ ] **Delivery is tuned by guess, not by ear.** The pauses (420ms between
      paragraphs, 900/650ms either side of a heading) and the heading slowdown
      were picked blind. They need adjusting against a real voice.

## Cloud voices (framework step 5)

- [ ] **Stand up the `/api/tts` endpoint.** The provider is written and has
      never spoken to a live one.
- [ ] **Measure the real cost of one full book** before turning it on for a
      whole library.
- [ ] **Pre-synthesize the next chunk while the current one plays.** System
      voices now play a paragraph as one continuous queue; cloud voices cannot
      yet, so they will gap between chunks exactly the way system voices used
      to. This is what closes that.
- [ ] **Sentence-level highlight fallback.** Cloud audio carries no word
      timings, so highlighting drops to the whole chunk.
- [ ] **Cache eviction policy**, paired with the visible cache size above.

## Housekeeping

- [ ] **No CI.** A workflow running typecheck, tests and build on push would
      have caught things this session caught by hand.
- [ ] **No LICENSE file.**
- [ ] **No error boundary** — a render crash blanks the page with no recovery.
- [ ] **The voice picker has no focus trap** and does not restore focus on
      close. It is a dialog; keyboard users deserve better.
- [ ] **No `.env.example`** documenting the `VITE_TTS_*` variables.
- [ ] **Storage-quota failures surface as raw error strings.** A large library
      will hit the quota eventually and should say something useful.
- [ ] **Dead exports:** `audioCacheSize` and `getBook` are written and never
      called.

## Parked (v2)

- [ ] **OCR for scanned PDFs** (Tesseract). Detected and refused today.
- [ ] **Native iOS port** — PDFKit for extraction, AVSpeechSynthesizer to
      validate, then the same cloud provider.
- [ ] **Accounts and cross-device sync.** Everything is local-first today.
- [ ] **EPUB support.** Easier to extract than PDF and the same pipeline from
      chunking onward.
- [ ] **Per-book voice** — considered and deferred; the setting is global.
