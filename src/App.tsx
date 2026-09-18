import { useCallback, useEffect, useRef, useState } from 'react'
import { Library } from './components/Library'
import { Reader } from './components/Reader'
import type { ReaderSettings } from './components/Reader'
import { UploadDropzone } from './components/UploadDropzone'
import { ingestFile } from './lib/ingest'
import type { IngestProgress } from './lib/ingest'
import {
  deleteBook,
  getSetting,
  listBooks,
  listProgress,
  saveBook,
  saveProgress,
  setSetting,
} from './lib/storage/db'
import type { BookRecord, ProgressRecord } from './lib/storage/db'
import { availableProviders } from './lib/tts'

const DEFAULT_SETTINGS: ReaderSettings = {
  rate: 1,
  providerId: 'web-speech',
  voiceId: null,
  favouriteVoiceIds: [],
}

export default function App() {
  const [books, setBooks] = useState<BookRecord[]>([])
  const [progress, setProgress] = useState<Record<string, ProgressRecord>>({})
  const [settings, setSettings] = useState<ReaderSettings>(DEFAULT_SETTINGS)
  const [openId, setOpenId] = useState<string | null>(null)
  const [busy, setBusy] = useState<IngestProgress | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [ready, setReady] = useState(false)

  // Lets the delete handler read the current list without changing identity.
  const booksRef = useRef(books)
  booksRef.current = books

  useEffect(() => {
    void (async () => {
      try {
        const [storedBooks, storedProgress, storedSettings] = await Promise.all([
          listBooks(),
          listProgress(),
          getSetting<ReaderSettings>('settings'),
        ])
        setBooks(storedBooks)
        setProgress(storedProgress)
        if (storedSettings) setSettings({ ...DEFAULT_SETTINGS, ...storedSettings })
      } catch (loadError) {
        setError(messageOf(loadError))
      } finally {
        setReady(true)
      }
    })()
  }, [])

  const handleFile = useCallback(async (file: File) => {
    setError(null)
    setBusy({ stage: 'reading', fraction: 0 })
    try {
      const book = await ingestFile(file, setBusy)
      await saveBook(book, file)
      setBooks((current) => [book, ...current])
      setOpenId(book.id)
    } catch (ingestError) {
      setError(messageOf(ingestError))
    } finally {
      setBusy(null)
    }
  }, [])

  const handleDelete = useCallback(async (id: string) => {
    const book = booksRef.current.find((item) => item.id === id)
    if (book && !window.confirm(`Remove “${book.title}” and its cached audio?`)) return
    await deleteBook(id)
    setBooks((current) => current.filter((item) => item.id !== id))
    setProgress((current) => {
      const next = { ...current }
      delete next[id]
      return next
    })
  }, [])

  const updateSettings = useCallback((partial: Partial<ReaderSettings>) => {
    setSettings((current) => {
      const next = { ...current, ...partial }
      void setSetting('settings', next)
      return next
    })
  }, [])

  const handleProgress = useCallback(
    (chunkIndex: number) => {
      if (!openId) return
      void saveProgress(openId, chunkIndex)
      setProgress((current) => ({
        ...current,
        [openId]: { bookId: openId, chunkIndex, updatedAt: Date.now() },
      }))
    },
    [openId],
  )

  const openBook = books.find((book) => book.id === openId)
  const providers = availableProviders()

  if (!ready) return <div className="app app--loading">Loading your library…</div>

  if (openBook) {
    return (
      <div className="app">
        <Reader
          book={openBook}
          initialIndex={progress[openBook.id]?.chunkIndex ?? 0}
          settings={settings}
          onSettingsChange={updateSettings}
          onProgress={handleProgress}
          onBack={() => setOpenId(null)}
        />
      </div>
    )
  }

  return (
    <div className="app app--library">
      {providers.length ? null : (
        <p className="error">
          This browser has no speech engine available. Chrome, Edge and Safari all ship one.
        </p>
      )}

      <Library
        books={books}
        progress={progress}
        onOpen={setOpenId}
        onDelete={(id) => void handleDelete(id)}
      >
        {/* The shelf owns the page heading, so adding a book lives inside it:
            the empty state when there is nothing yet, a quiet strip once there is. */}
        <UploadDropzone
          onFile={(file) => void handleFile(file)}
          busy={busy}
          error={error}
          variant={books.length ? 'add' : 'empty'}
        />
      </Library>
    </div>
  )
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}
