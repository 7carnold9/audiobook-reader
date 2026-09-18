# Audiobook Reader

Drop in a PDF, get an audiobook. The app extracts the text, cleans up the page
layout, splits it into narration-sized chunks and reads it aloud with the
controls you would expect from an audiobook player: play/pause, scrubbing,
speed, chapters, synced text and resume-where-you-left-off.

Everything runs in the browser. Nothing is uploaded anywhere.

## Why a web app

The MVP is the web stack from the project framework — React + `pdf.js` for
extraction, the Web Speech API to validate the pipeline end to end, and a
pluggable TTS layer so a cloud voice can be dropped in without touching the
player. It runs on any machine, is quick to iterate on, and the extraction work
(the genuinely hard part) ports to iOS later if a native app follows.

## Quick start

Needs Node 20.19 or newer.

```bash
npm install
npm run dev        # http://localhost:5173
```

Drop a PDF on the page and press play. Everything is kept in the browser, so the
library is per-browser-profile: clearing site data clears the shelf.

### Getting good voices

The narration is only as good as the voices your system has installed, and the
ones that ship by default are the robotic ones. On recent macOS they live in
System Settings → Accessibility → Spoken Content → System Voice → Manage
Voices, where the premium English voices are a download each; on Windows it is
Settings → Time & language → Speech. Restart the browser afterwards, then star
the good ones with the `Pick voices` button.

Chrome exposes the most voices (system voices plus Google's own), Safari and
Edge expose the system ones. Whichever you use, the first press of play has to
come from a real click — browsers block speech that starts on its own.

```bash
npm test           # unit tests for extraction, chunking and normalization
npm run build      # typecheck + production build
npm run fixtures   # generate the test PDFs in fixtures/ (needs python + reportlab)
npm run probe -- fixtures/paper.pdf   # print what the narrator would say
```

`npm run probe` runs the real pipeline over any PDF from the command line and
prints the chunks, chapters and cleaning stats. It is the fastest way to check
an extraction change against a document that reads badly.

## How it works

```
PDF ─▶ extract ─▶ clean ─▶ chunk ─▶ normalize ─▶ speak ─▶ play
```

| Stage | File | What it does |
|---|---|---|
| Extract | `src/lib/pdf/extract.ts`, `lines.ts` | pdf.js text items regrouped into visual lines with positions and font sizes |
| Clean | `src/lib/pdf/clean.ts` | column ordering, header/footer and footnote removal, de-hyphenation, paragraph detection |
| Chunk | `src/lib/pdf/chunk.ts` | sentence-aware splitting into ~320-character chunks (the unit of synthesis and caching) |
| Chapters | `src/lib/pdf/chapters.ts` | PDF outline (bookmarks) where present, heading heuristics otherwise |
| Normalize | `src/lib/text/normalize.ts` | citations, URLs, maths symbols and abbreviations rewritten for speech |
| Speak | `src/lib/tts/*` | provider interface; browser voices today, cloud voices behind the same interface |
| Play | `src/state/narration.ts`, `usePlayer.ts` | continuous playback, pacing, seeking, speed, word-boundary highlighting |

A few decisions worth knowing about:

- **Layout, not just text.** Line grouping keeps x/y positions so a two-column
  page can be split at its empty gutter and read column by column, and so
  running headers, page numbers and small-type footnotes can be dropped.
  Paragraphs continue across page and column breaks when the previous line ran
  to its margin.
- **Normalization keeps its alignment.** Rewriting text for speech would
  normally break word highlighting, so it is done token by token: every spoken
  word points back at the display token it came from. That is what drives the
  word-level highlight in the transcript.
- **Chunks are stable.** The same paragraphs always produce the same chunks, so
  synthesized audio can be cached per chunk and never regenerated.
- **Chunks are a synthesis detail, not a unit of speech.** A paragraph split
  across three chunks is handed to the engine as one queue and plays straight
  through with no seam. The narration only stops where a narrator would breathe
  — between paragraphs, and either side of a heading, which is also read a
  little slower. Sequencing lives in `src/state/narration.ts` and is tested
  against a fake engine, because the pauses are what make it sound narrated
  rather than machine-read.

## Controls

Space play/pause · ← → previous/next chunk · J/L back/forward ten chunks ·
V open the voice picker · click any paragraph to jump there. Lock-screen and
headset controls are wired up through the Media Session API, and the screen is
kept awake while narrating.

### Voices

Chrome alone exposes well over a hundred system voices, which is useless as a
dropdown. Instead, the picker (the `Pick voices` button, or `V`) lists every
voice the engine offers with search over names and language tags, and previews
each one **on the passage you are currently reading** rather than a canned demo
sentence. Star up to six and they become buttons in the player bar, so switching
later is one click. The shortlist and the chosen voice are stored with your other
settings, so they survive a reload.

Previewing cancels whatever the engine is saying, so narration stops while the
picker is open and resumes from the start of the current chunk when it closes.

Position, speed and voice are stored per book in IndexedDB, along with the PDF
itself, so the library survives a reload and each book resumes where it stopped.

## Using a cloud voice

Browser voices are free and offline but robotic. `src/lib/tts/http.ts` speaks
through any backend endpoint that accepts `{ text, voiceId }` and returns audio
bytes, caching every chunk in IndexedDB on first synthesis (playback speed is
applied with `playbackRate`, so the cache is speed-independent).

```bash
# .env.local
VITE_TTS_ENDPOINT=http://localhost:8787/api/tts
VITE_TTS_NAME="OpenAI TTS"
VITE_TTS_VOICES=alloy:Alloy,nova:Nova,shimmer:Shimmer
```

The endpoint keeps the provider key server-side. A minimal version:

```js
app.post('/api/tts', async (req, res) => {
  const upstream = await fetch('https://api.openai.com/v1/audio/speech', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      model: 'gpt-4o-mini-tts',
      voice: req.body.voiceId ?? 'alloy',
      input: req.body.text,
    }),
  })
  res.type('audio/mpeg').send(Buffer.from(await upstream.arrayBuffer()))
})
```

Cost is worth estimating before pointing this at a whole book: a 300-page novel
is roughly 600k characters, which is a real per-book bill at most providers'
per-character pricing. The chunk cache means you pay once per chunk per voice,
and switching voices re-synthesizes.

The provider selector only appears when `VITE_TTS_ENDPOINT` is set. Cloud audio
has no word-timing data, so highlighting falls back to the chunk level.

## What has been tested

- 48 unit tests over line grouping, cleaning, chunking, chapters, speech
  normalization, voice shortlisting and the playback timeline (`npm test`).
- The full pipeline run over three generated fixture PDFs — a novel with running
  headers, hyphenation and outline bookmarks; a two-column paper with footnotes,
  citations and maths; a report with a table and bullets (`npm run probe`).
  They are generated rather than downloaded because this environment has no
  outbound access to fetch real books; `scripts/make-fixtures.py` builds them.
- A browser run in Chromium: upload, extraction, transcript, chapter list,
  scrubbing, speed, and library plus resume position surviving a reload. The
  voice picker was driven against a stubbed voice list — search, starring, the
  six-voice cap, quick-switching from the player bar and persistence across a
  reload.

The one thing that could not be verified here is audio itself — the headless
browser has no system voices installed, so the player correctly reports that the
speech engine could not start. Narration needs a real browser with voices.

## Known limitations

- **Scanned PDFs are not supported.** There is no text layer to extract, so the
  app says so instead of failing silently. OCR (Tesseract) would be the fix.
- **De-hyphenation joins real compounds.** A line ending in `key-` followed by
  `value` becomes `keyvalue`; distinguishing that from `thir-`/`teen` needs a
  dictionary.
- **Tables are read row by row**, which is honest but rarely pleasant.
- **Equations are read symbol by symbol.** Common operators and Greek letters
  are named; anything more structural (fractions, subscripts) is not.
- **Speed changes restart the current chunk** — the Web Speech API cannot change
  rate mid-utterance.
- **Rendering is windowed** to ±120 chunks around the current position, so the
  transcript is not a full document view.

## Next up

Chapter detection for documents with neither bookmarks nor obvious headings,
OCR for scanned PDFs, a sentence-level rather than word-level highlight fallback
for cloud voices, and pre-synthesizing the next chunk while the current one
plays to remove the gap between chunks on cloud voices.
