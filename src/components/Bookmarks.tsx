import type { BookmarkRecord } from '../lib/storage/db'

interface Props {
  bookmarks: BookmarkRecord[]
  onOpen: (bookmark: BookmarkRecord) => void
  onDelete: (id: string) => void
}

export function Bookmarks({ bookmarks, onOpen, onDelete }: Props) {
  if (!bookmarks.length) return null

  return (
    <nav className="sidebar__section" aria-label="Bookmarks">
      <h3>Bookmarks</h3>
      <ul>
        {bookmarks.map((bookmark) => (
          <li key={bookmark.id} className="bookmark">
            <button type="button" className="sidebar__item" onClick={() => onOpen(bookmark)}>
              <span className="bookmark__excerpt">{bookmark.excerpt}</span>
              <span className="muted">p.{bookmark.page}</span>
            </button>
            <button
              type="button"
              className="bookmark__delete"
              aria-label={`Remove bookmark: ${bookmark.excerpt}`}
              onClick={() => onDelete(bookmark.id)}
            >
              ×
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
