import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { Bookmarks } from './Bookmarks'
import { ChapterList } from './ChapterList'
import { PlayerBar } from './PlayerBar'
import { Transcript } from './Transcript'
import { VoicePicker } from './VoicePicker'
import { availableProviders } from '../lib/tts'
import type { TtsVoice } from '../lib/tts'
import { deleteBookmark, listBookmarks, saveBookmark } from '../lib/storage/db'
import type { BookmarkRecord, BookRecord } from '../lib/storage/db'
import { clearBookVoice, readBookVoice, writeBookVoice } from '../lib/storage/bookVoices'
import { resolveVoice } from '../state/bookVoice'
import { usePlayer } from '../state/usePlayer'
import { useMediaSession, useWakeLock } from '../state/useMediaSession'

export interface ReaderSettings {
  rate: number
  providerId: string
  /** The voice for books that have none of their own; each book may override it. */
  voiceId: string | null
  /** Voice ids kept one click away in the player bar, in the order they were starred. */
  favouriteVoiceIds: string[]
}

interface Props {
  book: BookRecord
  initialIndex: number
  settings: ReaderSettings
  onSettingsChange: (settings: Partial<ReaderSettings>) => void
  onProgress: (chunkIndex: number) => void
  onBack: () => void
}

export function Reader({ book, initialIndex, settings, onSettingsChange, onProgress, onBack }: Props) {
  const providers = useMemo(() => availableProviders(), [])
  const provider = providers.find((item) => item.id === settings.providerId) ?? providers[0]
  const [voices, setVoices] = useState<TtsVoice[]>([])
  const [bookmarks, setBookmarks] = useState<BookmarkRecord[]>([])
  const [voicesOpen, setVoicesOpen] = useState(false)
  const [detailsOpen, setDetailsOpen] = useState(false)

  useEffect(() => {
    let active = true
    void provider?.listVoices().then((list) => {
      if (active) setVoices(list)
    })
    return () => {
      active = false
    }
  }, [provider])

  useEffect(() => {
    void listBookmarks(book.id).then(setBookmarks)
  }, [book.id])

  // The voice this book was last read in, null while it follows the default.
  const [bookVoiceId, setBookVoiceId] = useState<string | null>(null)
  // Bumped by any choice the reader makes, so a slow load cannot land on top of it.
  const loadToken = useRef(0)

  useEffect(() => {
    const token = ++loadToken.current
    setBookVoiceId(null)
    void readBookVoice(book.id).then((stored) => {
      if (loadToken.current === token) setBookVoiceId(stored)
    })
  }, [book.id])

  const resolved = useMemo(
    () =>
      resolveVoice({
        bookVoiceId,
        defaultVoiceId: settings.voiceId,
        voices,
        language: navigator.language,
      }),
    [bookVoiceId, settings.voiceId, voices],
  )

  // Seed the default the first time a provider's list arrives, and repair it when
  // the engine stops offering whatever was saved.
  useEffect(() => {
    if (resolved.source !== 'auto' || !resolved.voiceId) return
    onSettingsChange({ voiceId: resolved.voiceId })
  }, [resolved, onSettingsChange])

  const chooseVoice = useCallback(
    (id: string) => {
      loadToken.current += 1
      setBookVoiceId(id)
      void writeBookVoice(book.id, id)
    },
    [book.id],
  )

  // Hands the book back to the default, rather than pinning today's default to it.
  const followDefaultVoice = useCallback(() => {
    loadToken.current += 1
    setBookVoiceId(null)
    void clearBookVoice(book.id)
  }, [book.id])

  const makeVoiceDefault = useCallback(() => {
    if (resolved.voiceId) onSettingsChange({ voiceId: resolved.voiceId })
  }, [resolved.voiceId, onSettingsChange])

  const player = usePlayer({
    bookId: book.id,
    chunks: book.chunks,
    provider,
    voiceId: resolved.voiceId,
    initialIndex,
    initialRate: settings.rate,
    onIndexChange: onProgress,
  })

  const { setRate, toggle, skip, startAt, seekToSeconds } = player
  useEffect(() => {
    setRate(settings.rate)
  }, [settings.rate, setRate])

  const next = useCallback(() => skip(1), [skip])
  const previous = useCallback(() => skip(-1), [skip])

  useMediaSession({
    title: book.title,
    artist: book.author,
    playing: player.status === 'playing',
    onPlay: player.play,
    onPause: player.pause,
    onNext: next,
    onPrevious: previous,
  })
  useWakeLock(player.status === 'playing')

  // Previewing a voice cancels whatever the engine is saying, so narration is
  // stopped while the drawer is open and picked back up on close.
  const [resumeAfterVoices, setResumeAfterVoices] = useState(false)
  const { stop: stopPlayback, play: startPlayback } = player

  const openVoices = useCallback(() => {
    setResumeAfterVoices(player.status === 'playing')
    stopPlayback()
    setVoicesOpen(true)
  }, [player.status, stopPlayback])

  const closeVoices = useCallback(() => {
    setVoicesOpen(false)
    if (resumeAfterVoices) startPlayback()
    setResumeAfterVoices(false)
  }, [resumeAfterVoices, startPlayback])

  const currentChunk = book.chunks[Math.min(player.index, book.chunks.length - 1)]
  const currentToken = Math.max(0, player.tokenIndex)

  const bookmarkHere = bookmarks.find(
    (bookmark) =>
      bookmark.chunkIndex === player.index && Math.abs(bookmark.tokenIndex - currentToken) <= 8,
  )

  const toggleBookmark = useCallback(() => {
    if (bookmarkHere) {
      void deleteBookmark(bookmarkHere.id)
      setBookmarks((current) => current.filter((item) => item.id !== bookmarkHere.id))
      return
    }
    if (!currentChunk) return
    const words = currentChunk.text.split(/\s+/).slice(currentToken, currentToken + 9)
    const bookmark: BookmarkRecord = {
      id: crypto.randomUUID(),
      bookId: book.id,
      chunkIndex: player.index,
      tokenIndex: currentToken,
      page: currentChunk.page,
      excerpt: words.join(' ') || currentChunk.text.slice(0, 60),
      createdAt: Date.now(),
    }
    void saveBookmark(bookmark)
    setBookmarks((current) =>
      [...current, bookmark].sort(
        (a, b) => a.chunkIndex - b.chunkIndex || a.tokenIndex - b.tokenIndex,
      ),
    )
  }, [bookmarkHere, book.id, currentChunk, currentToken, player.index])

  const removeBookmark = useCallback((id: string) => {
    void deleteBookmark(id)
    setBookmarks((current) => current.filter((item) => item.id !== id))
  }, [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      if (voicesOpen) return
      switch (event.key) {
        case ' ':
          event.preventDefault()
          toggle()
          break
        case 'ArrowRight':
          seekToSeconds(player.elapsed + 15)
          break
        case 'ArrowLeft':
          seekToSeconds(player.elapsed - 15)
          break
        case 'l':
          skip(1)
          break
        case 'j':
          skip(-1)
          break
        case 'v':
          openVoices()
          break
        case 'b':
          toggleBookmark()
          break
        case '[':
          onSettingsChange({ rate: Math.max(0.5, Number((settings.rate - 0.05).toFixed(2))) })
          break
        case ']':
          onSettingsChange({ rate: Math.min(3, Number((settings.rate + 0.05).toFixed(2))) })
          break
        default:
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [
    toggle,
    skip,
    seekToSeconds,
    player.elapsed,
    voicesOpen,
    openVoices,
    toggleBookmark,
    onSettingsChange,
    settings.rate,
  ])

  const voiceLabel = voices.find((voice) => voice.id === resolved.voiceId)?.name ?? 'System voice'
  const defaultVoiceLabel = voices.find((voice) => voice.id === settings.voiceId)?.name ?? null

  return (
    <div className="reader">
      <header className="topbar">
        <button type="button" className="iconbutton" onClick={onBack} aria-label="Back to library">
          ‹
        </button>
        <h1 className="topbar__title">{book.title}</h1>
        <div className="topbar__end">
          <button
            type="button"
            className="iconbutton"
            onClick={() => setDetailsOpen((open) => !open)}
            aria-expanded={detailsOpen}
            aria-label="Extraction details"
          >
            ⋯
          </button>
          {detailsOpen ? <ExtractionDetails book={book} onClose={() => setDetailsOpen(false)} /> : null}
        </div>
      </header>

      <div className="reader__body">
        <aside className="sidebar">
          <ChapterList chapters={book.chapters} currentIndex={player.index} onSeek={player.seekToChunk} />
          <Bookmarks
            bookmarks={bookmarks}
            onOpen={(bookmark) => startAt(bookmark.chunkIndex, bookmark.tokenIndex)}
            onDelete={removeBookmark}
          />
        </aside>

        <main className="reader__main">
          <Transcript
            chunks={book.chunks}
            index={player.index}
            tokenIndex={player.tokenIndex}
            wordHighlighting={provider?.supportsBoundaries ?? false}
            onStartAt={startAt}
          />
        </main>
      </div>

      <footer className="reader__footer">
        <PlayerBar
          player={player}
          onRateChange={(rate) => onSettingsChange({ rate })}
          title={book.title}
          page={currentChunk?.page ?? 1}
          pageCount={book.pageCount}
          unit={book.format === 'epub' ? 'section' : 'page'}
          voiceLabel={voiceLabel}
          onOpenVoices={openVoices}
          onBookmark={toggleBookmark}
          bookmarked={Boolean(bookmarkHere)}
        />
      </footer>

      {voicesOpen ? (
        <VoicePicker
          provider={provider}
          voices={voices}
          voiceId={resolved.voiceId}
          defaultVoiceId={settings.voiceId}
          defaultVoiceLabel={defaultVoiceLabel}
          bookTitle={book.title}
          followsDefault={resolved.source !== 'book'}
          favourites={settings.favouriteVoiceIds}
          sample={previewSample(currentChunk?.text)}
          rate={settings.rate}
          onVoiceChange={chooseVoice}
          onMakeDefault={makeVoiceDefault}
          onFollowDefault={followDefaultVoice}
          onFavouritesChange={(favouriteVoiceIds) => onSettingsChange({ favouriteVoiceIds })}
          onClose={closeVoices}
        />
      ) : null}
    </div>
  )
}

function ExtractionDetails({ book, onClose }: { book: BookRecord; onClose: () => void }) {
  return (
    <div className="popover" role="dialog" aria-label="Extraction details">
      <h3>Extraction</h3>
      <ul className="muted">
        <li>
          {book.chunks.length} chunks across {book.pageCount} pages
        </li>
        <li>{book.stats.droppedMarginLines} header/footer lines removed</li>
        <li>{book.stats.droppedFootnoteLines} footnote lines skipped</li>
        <li>{book.stats.twoColumnPages} multi-column pages re-ordered</li>
      </ul>
      <button type="button" className="button button--ghost" onClick={onClose}>
        Close
      </button>
    </div>
  )
}

/** A preview should sound like the book, not like a demo sentence. */
function previewSample(text: string | undefined): string {
  const trimmed = text?.trim()
  if (!trimmed || trimmed.length < 40) {
    return 'It was a bright cold day in April, and the clocks were striking thirteen.'
  }
  return trimmed.length > 220 ? `${trimmed.slice(0, 220).replace(/\s\S*$/, '')}…` : trimmed
}
