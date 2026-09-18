import { useEffect, useMemo, useRef, useState } from 'react'
import type { ReactNode } from 'react'
import type { BookRecord, ProgressRecord } from '../lib/storage/db'
import { buildTimeline } from '../state/usePlayer'

type Scope = 'all' | 'reading' | 'finished'
type Sort = 'added' | 'title' | 'remaining'

interface Props {
  books: BookRecord[]
  progress: Record<string, ProgressRecord>
  onOpen: (id: string) => void
  onDelete: (id: string) => void
  /**
   * Rendered under the shelf, and in place of it while the shelf is empty —
   * the upload dropzone lives here so an empty library is the invitation to
   * add the first book rather than a blank page.
   */
  children?: ReactNode
}

/** A book plus everything the shelf needs to show and order it. */
interface Shelved {
  book: BookRecord
  /** Seconds of narration left at 1× speed. */
  remaining: number
  /** 0–1, how far through the book the saved position is. */
  fraction: number
  started: boolean
  finished: boolean
}

const SCOPES: { id: Scope; label: string }[] = [
  { id: 'all', label: 'All titles' },
  { id: 'reading', label: 'In progress' },
  { id: 'finished', label: 'Finished' },
]

const SORTS: { id: Sort; label: string }[] = [
  { id: 'added', label: 'Recently added' },
  { id: 'title', label: 'Title' },
  { id: 'remaining', label: 'Time left' },
]

export function Library({ books, progress, onOpen, onDelete, children }: Props) {
  const [scope, setScope] = useState<Scope>('all')
  const [sort, setSort] = useState<Sort>('added')
  const [query, setQuery] = useState('')
  // Only one row's overflow menu is open at a time, so the open one is tracked here.
  const [menuId, setMenuId] = useState<string | null>(null)

  // Timelines walk every chunk of every book, so they are only rebuilt when the
  // shelf itself changes.
  const shelved = useMemo(() => books.map((book) => shelve(book, progress[book.id])), [books, progress])

  const visible = useMemo(() => {
    const needle = query.trim().toLowerCase()
    const matching = shelved.filter((item) => inScope(item, scope) && matches(item.book, needle))
    return [...matching].sort(compareBy(sort))
  }, [shelved, scope, query, sort])

  return (
    <section className="library" aria-labelledby="library-heading">
      <h1 className="library__heading" id="library-heading">
        Library
      </h1>

      {books.length > 0 ? (
        <div className="library__controls">
          <div className="library__scopes" role="group" aria-label="Show">
            {SCOPES.map((option) => (
              <button
                key={option.id}
                type="button"
                className="pill"
                aria-pressed={scope === option.id}
                onClick={() => setScope(option.id)}
              >
                {option.label}
              </button>
            ))}
          </div>

          <div className="library__tools">
            <label className="library__search">
              <span className="library__hidden-label">Search your library</span>
              <input
                type="search"
                className="pill library__search-input"
                placeholder="Search title or author"
                value={query}
                onChange={(event) => setQuery(event.target.value)}
              />
            </label>

            <label className="pill library__sort">
              <span className="library__sort-label">Sort by</span>
              <select
                className="library__sort-select"
                value={sort}
                onChange={(event) => setSort(event.target.value as Sort)}
              >
                {SORTS.map((option) => (
                  <option key={option.id} value={option.id}>
                    {option.label}
                  </option>
                ))}
              </select>
              <span className="library__caret" aria-hidden="true">
                ▾
              </span>
            </label>
          </div>
        </div>
      ) : null}

      {books.length > 0 && visible.length === 0 ? (
        <p className="library__empty">Nothing here yet — try a different search or scope.</p>
      ) : null}

      {visible.length > 0 ? (
        <ul className="library__list">
          {visible.map((item) => (
            <BookRow
              key={item.book.id}
              item={item}
              menuOpen={menuId === item.book.id}
              onToggleMenu={() => setMenuId((current) => (current === item.book.id ? null : item.book.id))}
              onCloseMenu={() => setMenuId(null)}
              onOpen={onOpen}
              onDelete={onDelete}
            />
          ))}
        </ul>
      ) : null}

      {children ? <div className="library__add">{children}</div> : null}
    </section>
  )
}

interface RowProps {
  item: Shelved
  menuOpen: boolean
  onToggleMenu: () => void
  onCloseMenu: () => void
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}

function BookRow({ item, menuOpen, onToggleMenu, onCloseMenu, onOpen, onDelete }: RowProps) {
  const { book } = item
  const menuRef = useRef<HTMLDivElement>(null)
  const triggerRef = useRef<HTMLButtonElement>(null)

  useEffect(() => {
    if (!menuOpen) return
    const onPointerDown = (event: PointerEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) onCloseMenu()
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      onCloseMenu()
      // Escape should leave the caret where it started, not at the top of the page.
      triggerRef.current?.focus()
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [menuOpen, onCloseMenu])

  const status = item.finished ? 'Finished' : formatTimeLeft(item.remaining)

  return (
    <li className="book">
      <div className="book__body">
        <h2 className="book__title">{book.title}</h2>
        <p className="book__author">{book.author ?? 'Unknown author'}</p>

        <p className="book__status">
          <ProgressRing fraction={item.finished ? 1 : item.fraction} />
          <span>{status}</span>
        </p>

        <div className="book__actions">
          <button type="button" className="book__play" onClick={() => onOpen(book.id)}>
            <span aria-hidden="true">▶</span> Play
          </button>

          <div className="menu" ref={menuRef}>
            <button
              ref={triggerRef}
              type="button"
              className="menu__trigger"
              aria-haspopup="menu"
              aria-expanded={menuOpen}
              aria-label={`More actions for ${book.title}`}
              onClick={onToggleMenu}
            >
              <span aria-hidden="true">…</span>
            </button>

            {menuOpen ? (
              <div className="menu__popup" role="menu" aria-label={book.title}>
                <button
                  type="button"
                  role="menuitem"
                  className="menu__item menu__item--danger"
                  onClick={() => {
                    onCloseMenu()
                    onDelete(book.id)
                  }}
                >
                  Remove from library
                </button>
              </div>
            ) : null}
          </div>
        </div>
      </div>

      {/* There are no cover images, so the cover is set from the title itself. */}
      <button
        type="button"
        className="book__cover"
        aria-label={`Open ${book.title}`}
        onClick={() => onOpen(book.id)}
      >
        <span className="book__cover-title">{book.title}</span>
        {book.author ? <span className="book__cover-author">{book.author}</span> : null}
      </button>
    </li>
  )
}

function ProgressRing({ fraction }: { fraction: number }) {
  const radius = 9
  const circumference = 2 * Math.PI * radius
  return (
    <svg className="ring" viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <circle className="ring__track" cx="12" cy="12" r={radius} fill="none" strokeWidth="2.5" />
      <circle
        className="ring__value"
        cx="12"
        cy="12"
        r={radius}
        fill="none"
        strokeWidth="2.5"
        strokeLinecap="round"
        strokeDasharray={circumference}
        strokeDashoffset={circumference * (1 - clamp(fraction))}
      />
    </svg>
  )
}

function shelve(book: BookRecord, record: ProgressRecord | undefined): Shelved {
  const timeline = buildTimeline(book.chunks)
  const last = Math.max(0, book.chunks.length - 1)
  const index = Math.min(Math.max(record?.chunkIndex ?? 0, 0), last)
  const elapsed = timeline.starts[index] ?? 0
  return {
    book,
    remaining: Math.max(0, timeline.total - elapsed),
    fraction: timeline.total > 0 ? elapsed / timeline.total : 0,
    started: record !== undefined,
    // The saved position is the chunk being read, so reaching the last one is as
    // finished as a book ever gets.
    finished: record !== undefined && index >= last,
  }
}

function inScope(item: Shelved, scope: Scope): boolean {
  if (scope === 'reading') return item.started && !item.finished
  if (scope === 'finished') return item.finished
  return true
}

function matches(book: BookRecord, needle: string): boolean {
  if (!needle) return true
  return `${book.title} ${book.author ?? ''}`.toLowerCase().includes(needle)
}

function compareBy(sort: Sort): (a: Shelved, b: Shelved) => number {
  if (sort === 'title') return (a, b) => a.book.title.localeCompare(b.book.title)
  // Least left first: the book you are closest to finishing is the one to pick up.
  if (sort === 'remaining') return (a, b) => a.remaining - b.remaining
  return (a, b) => b.book.addedAt - a.book.addedAt
}

function formatTimeLeft(seconds: number): string {
  // Anything under a minute still has something left to read, so never round to zero.
  const minutes = Math.max(1, Math.round(seconds / 60))
  const hours = Math.floor(minutes / 60)
  const rest = minutes % 60
  if (!hours) return `${rest} ${plural(rest, 'min')} left`
  if (!rest) return `${hours} ${plural(hours, 'hr')} left`
  return `${hours} ${plural(hours, 'hr')} ${rest} ${plural(rest, 'min')} left`
}

function plural(count: number, word: string): string {
  return count === 1 ? word : `${word}s`
}

function clamp(value: number): number {
  return Math.min(1, Math.max(0, value))
}
