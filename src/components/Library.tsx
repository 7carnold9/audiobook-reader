import type { BookRecord, ProgressRecord } from '../lib/storage/db'

interface Props {
  books: BookRecord[]
  progress: Record<string, ProgressRecord>
  onOpen: (id: string) => void
  onDelete: (id: string) => void
}

export function Library({ books, progress, onOpen, onDelete }: Props) {
  if (!books.length) return null

  return (
    <section className="library">
      <h2>Your library</h2>
      <ul className="library__list">
        {books.map((book) => {
          const position = progress[book.id]?.chunkIndex ?? 0
          const percent = book.chunks.length ? Math.round((position / book.chunks.length) * 100) : 0
          return (
            <li key={book.id} className="card">
              <button type="button" className="card__main" onClick={() => onOpen(book.id)}>
                <span className="card__title">{book.title}</span>
                <span className="muted">
                  {book.author ? `${book.author} · ` : ''}
                  {book.pageCount} pages · {formatWords(book.wordCount)}
                </span>
                <span className="bar bar--thin">
                  <span className="bar__fill" style={{ width: `${percent}%` }} />
                </span>
                <span className="muted">{percent > 0 ? `${percent}% listened` : 'Not started'}</span>
              </button>
              <button
                type="button"
                className="card__delete"
                aria-label={`Remove ${book.title}`}
                onClick={() => onDelete(book.id)}
              >
                ×
              </button>
            </li>
          )
        })}
      </ul>
    </section>
  )
}

function formatWords(count: number): string {
  if (count >= 1000) return `${Math.round(count / 1000)}k words`
  return `${count} words`
}
