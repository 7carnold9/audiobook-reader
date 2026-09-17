import type { Chapter } from '../lib/pdf/types'

interface Props {
  chapters: Chapter[]
  currentIndex: number
  onSeek: (chunkIndex: number) => void
}

export function ChapterList({ chapters, currentIndex, onSeek }: Props) {
  if (chapters.length < 2) return null

  const activeChapter = chapters.reduce(
    (best, chapter) => (chapter.chunkIndex <= currentIndex ? chapter : best),
    chapters[0],
  )

  return (
    <nav className="chapters" aria-label="Chapters">
      <h3>Chapters</h3>
      <ul>
        {chapters.map((chapter) => (
          <li key={`${chapter.chunkIndex}-${chapter.title}`}>
            <button
              type="button"
              className={`chapters__item${chapter === activeChapter ? ' chapters__item--active' : ''}`}
              style={{ paddingLeft: `${0.6 + Math.min(chapter.level, 3) * 0.7}rem` }}
              onClick={() => onSeek(chapter.chunkIndex)}
            >
              <span className="chapters__title">{chapter.title}</span>
              <span className="muted">p.{chapter.page}</span>
            </button>
          </li>
        ))}
      </ul>
    </nav>
  )
}
