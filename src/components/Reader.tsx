import { useCallback, useEffect, useMemo, useState } from 'react'
import { ChapterList } from './ChapterList'
import { PlayerBar } from './PlayerBar'
import { Transcript } from './Transcript'
import { availableProviders } from '../lib/tts'
import type { TtsVoice } from '../lib/tts'
import { usePlayer } from '../state/usePlayer'
import { useMediaSession, useWakeLock } from '../state/useMediaSession'
import type { BookRecord } from '../lib/storage/db'

export interface ReaderSettings {
  rate: number
  providerId: string
  voiceId: string | null
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

  useEffect(() => {
    let active = true
    void provider?.listVoices().then((list) => {
      if (active) setVoices(list)
    })
    return () => {
      active = false
    }
  }, [provider])

  // Pick a sensible default voice the first time a provider's list arrives.
  useEffect(() => {
    if (!voices.length) return
    if (settings.voiceId && voices.some((voice) => voice.id === settings.voiceId)) return
    const preferred =
      voices.find((voice) => voice.default && voice.lang.startsWith(navigator.language.slice(0, 2))) ??
      voices.find((voice) => voice.lang.startsWith(navigator.language.slice(0, 2))) ??
      voices[0]
    onSettingsChange({ voiceId: preferred.id })
  }, [voices, settings.voiceId, onSettingsChange])

  const player = usePlayer({
    bookId: book.id,
    chunks: book.chunks,
    provider,
    voiceId: settings.voiceId,
    initialIndex,
    initialRate: settings.rate,
    onIndexChange: onProgress,
  })

  const { setRate } = player
  useEffect(() => {
    setRate(settings.rate)
  }, [settings.rate, setRate])

  const { toggle, skip } = player
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

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement | null
      if (target && /^(INPUT|SELECT|TEXTAREA)$/.test(target.tagName)) return
      switch (event.key) {
        case ' ':
          event.preventDefault()
          toggle()
          break
        case 'ArrowRight':
          skip(1)
          break
        case 'ArrowLeft':
          skip(-1)
          break
        case 'l':
          skip(10)
          break
        case 'j':
          skip(-10)
          break
        default:
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [toggle, skip])

  const currentChunk = book.chunks[Math.min(player.index, book.chunks.length - 1)]

  return (
    <div className="reader">
      <header className="reader__header">
        <button type="button" className="button button--ghost" onClick={onBack}>
          ‹ Library
        </button>
        <div className="reader__title">
          <h1>{book.title}</h1>
          {book.author ? <p className="muted">{book.author}</p> : null}
        </div>
      </header>

      <div className="reader__body">
        <aside className="reader__sidebar">
          <ChapterList
            chapters={book.chapters}
            currentIndex={player.index}
            onSeek={player.seekToChunk}
          />
          <ExtractionNotes book={book} />
        </aside>

        <main className="reader__main">
          <Transcript
            chunks={book.chunks}
            index={player.index}
            tokenIndex={player.tokenIndex}
            wordHighlighting={provider?.supportsBoundaries ?? false}
            onSeek={player.seekToChunk}
          />
        </main>
      </div>

      <footer className="reader__footer">
        <PlayerBar
          player={player}
          onRateChange={(rate) => onSettingsChange({ rate })}
          page={currentChunk?.page ?? 1}
          pageCount={book.pageCount}
          providers={providers}
          providerId={provider?.id ?? ''}
          onProviderChange={(id) => onSettingsChange({ providerId: id, voiceId: null })}
          voices={voices}
          voiceId={settings.voiceId}
          onVoiceChange={(id) => onSettingsChange({ voiceId: id })}
        />
      </footer>
    </div>
  )
}

function ExtractionNotes({ book }: { book: BookRecord }) {
  return (
    <div className="notes">
      <h3>Extraction</h3>
      <ul className="muted">
        <li>{book.chunks.length} chunks across {book.pageCount} pages</li>
        <li>{book.stats.droppedMarginLines} header/footer lines removed</li>
        <li>{book.stats.droppedFootnoteLines} footnote lines skipped</li>
        <li>{book.stats.twoColumnPages} multi-column pages re-ordered</li>
      </ul>
    </div>
  )
}
