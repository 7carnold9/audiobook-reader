import type { Player } from '../state/usePlayer'

interface Props {
  player: Player
  onRateChange: (rate: number) => void
  title: string
  page: number
  pageCount: number
  voiceLabel: string
  onOpenVoices: () => void
  onBookmark: () => void
  /** True when a bookmark already sits at the current spot. */
  bookmarked: boolean
}

const RATES = [1, 1.25, 1.5, 1.75, 2, 2.5, 0.75]
/** Seconds the skip buttons move, matching the convention every audiobook app uses. */
const SKIP = 15

export function PlayerBar({
  player,
  onRateChange,
  title,
  page,
  pageCount,
  voiceLabel,
  onOpenVoices,
  onBookmark,
  bookmarked,
}: Props) {
  const playing = player.status === 'playing'
  const nextRate = () => RATES[(RATES.indexOf(player.rate) + 1) % RATES.length] ?? 1

  return (
    <div className="player">
      <div className="player__scrub">
        <span className="player__time">{formatTime(player.elapsed)}</span>
        <input
          type="range"
          min={0}
          max={Math.max(1, Math.round(player.duration))}
          value={Math.min(Math.round(player.elapsed), Math.round(player.duration))}
          onChange={(event) => player.seekToSeconds(Number(event.target.value))}
          aria-label="Position in book"
        />
        <span className="player__time">{formatTime(Math.max(0, player.duration - player.elapsed))}</span>
      </div>

      <div className="player__row">
        <div className="player__now">
          <span className="player__thumb" aria-hidden="true" />
          <span className="player__title">{title}</span>
          <span className="muted player__page">
            p.{page} / {pageCount}
          </span>
        </div>

        <div className="player__transport">
          <button
            type="button"
            className={`iconbutton${bookmarked ? ' iconbutton--on' : ''}`}
            onClick={onBookmark}
            title={bookmarked ? 'Remove the bookmark here (B)' : 'Bookmark this spot (B)'}
            aria-pressed={bookmarked}
          >
            <BookmarkIcon filled={bookmarked} />
          </button>

          <button
            type="button"
            className="iconbutton"
            onClick={() => player.seekToSeconds(player.elapsed - SKIP)}
            title={`Back ${SKIP} seconds`}
          >
            <SkipIcon seconds={SKIP} back />
          </button>

          <button type="button" className="playbutton" onClick={player.toggle} title="Play / pause (space)">
            {playing ? <PauseIcon /> : <PlayIcon />}
          </button>

          <button
            type="button"
            className="iconbutton"
            onClick={() => player.seekToSeconds(player.elapsed + SKIP)}
            title={`Forward ${SKIP} seconds`}
          >
            <SkipIcon seconds={SKIP} />
          </button>

          <button
            type="button"
            className="iconbutton iconbutton--text"
            onClick={() => onRateChange(nextRate())}
            title="Playback speed"
          >
            {player.rate}x
          </button>
        </div>

        <button type="button" className="voicepill" onClick={onOpenVoices} title="Choose a voice (V)">
          <span className="voicepill__dot" aria-hidden="true" />
          Read by <strong>{voiceLabel}</strong>
        </button>
      </div>

      {player.error ? (
        <p className="error" role="alert">
          {player.error}
        </p>
      ) : null}
    </div>
  )
}

export function formatTime(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) seconds = 0
  const total = Math.round(seconds)
  const hours = Math.floor(total / 3600)
  const minutes = Math.floor((total % 3600) / 60)
  const secs = total % 60
  const pad = (value: number) => String(value).padStart(2, '0')
  return hours ? `${hours}:${pad(minutes)}:${pad(secs)}` : `${minutes}:${pad(secs)}`
}

function PlayIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M8 5.5v13l11-6.5z" fill="currentColor" />
    </svg>
  )
}

function PauseIcon() {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <path d="M7 5h3.2v14H7zM13.8 5H17v14h-3.2z" fill="currentColor" />
    </svg>
  )
}

function BookmarkIcon({ filled }: { filled: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true">
      <path
        d="M7 4h10a1 1 0 0 1 1 1v15l-6-4-6 4V5a1 1 0 0 1 1-1z"
        fill={filled ? 'currentColor' : 'none'}
        stroke="currentColor"
        strokeWidth="1.6"
        strokeLinejoin="round"
      />
    </svg>
  )
}

/** The circular-arrow skip glyph with the seconds written inside it. */
function SkipIcon({ seconds, back = false }: { seconds: number; back?: boolean }) {
  return (
    <svg viewBox="0 0 24 24" width="22" height="22" aria-hidden="true">
      <g transform={back ? 'scale(-1,1) translate(-24,0)' : undefined}>
        <path
          d="M12 5.5a7 7 0 1 1-6.6 4.7"
          fill="none"
          stroke="currentColor"
          strokeWidth="1.6"
          strokeLinecap="round"
        />
        <path d="M12 2.5v6l4-3z" fill="currentColor" />
      </g>
      <text
        x="12"
        y="16"
        textAnchor="middle"
        fontSize="8"
        fontWeight="600"
        fill="currentColor"
        fontFamily="inherit"
      >
        {seconds}
      </text>
    </svg>
  )
}
