import { useEffect, useRef, useState } from 'react'
import type { Player } from '../state/usePlayer'

interface Props {
  player: Player
  onRateChange: (rate: number) => void
  title: string
  page: number
  pageCount: number
  /** EPUBs have no pages; their spine documents are sections. */
  unit?: 'page' | 'section'
  voiceLabel: string
  onOpenVoices: () => void
  onBookmark: () => void
  /** True when a bookmark already sits at the current spot. */
  bookmarked: boolean
}

/** Speeds worth one click. Everything between them is reachable on the slider. */
const COMMON_RATES = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3]
export const MIN_RATE = 0.5
export const MAX_RATE = 3
/** Fine enough for 1.1 and 1.25 alike. */
export const RATE_STEP = 0.05
/** Seconds the skip buttons move, matching the convention every audiobook app uses. */
const SKIP = 15

export function PlayerBar({
  player,
  onRateChange,
  title,
  page,
  pageCount,
  unit = 'page',
  voiceLabel,
  onOpenVoices,
  onBookmark,
  bookmarked,
}: Props) {
  const playing = player.status === 'playing'

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
            {unit === 'section' ? '§' : 'p.'}
            {page} / {pageCount}
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

          <SpeedControl rate={player.rate} onChange={onRateChange} />
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

/** 1 reads as "1", not "1.00"; 1.25 keeps both decimals. */
export function formatRate(rate: number): string {
  return `${Number(rate.toFixed(2))}`
}

/**
 * Speed as a slider, because the useful range is finer than a handful of
 * presets — but the presets are still one click away as marks under it.
 */
function SpeedControl({ rate, onChange }: { rate: number; onChange: (rate: number) => void }) {
  const [open, setOpen] = useState(false)
  const container = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (!open) return
    const onPointerDown = (event: PointerEvent) => {
      if (!container.current?.contains(event.target as Node)) setOpen(false)
    }
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false)
    }
    document.addEventListener('pointerdown', onPointerDown)
    document.addEventListener('keydown', onKeyDown)
    return () => {
      document.removeEventListener('pointerdown', onPointerDown)
      document.removeEventListener('keydown', onKeyDown)
    }
  }, [open])

  return (
    <div className="speed" ref={container}>
      <button
        type="button"
        className="iconbutton iconbutton--text"
        onClick={() => setOpen((current) => !current)}
        aria-expanded={open}
        title="Playback speed"
      >
        {formatRate(rate)}x
      </button>

      {open ? (
        <div className="speed__panel" role="dialog" aria-label="Playback speed">
          <div className="speed__value">{formatRate(rate)}×</div>
          <input
            type="range"
            min={MIN_RATE}
            max={MAX_RATE}
            step={RATE_STEP}
            value={rate}
            list="speed-marks"
            onChange={(event) => onChange(Number(event.target.value))}
            aria-label="Playback speed"
          />
          <datalist id="speed-marks">
            {COMMON_RATES.map((value) => (
              <option key={value} value={value} />
            ))}
          </datalist>
          <div className="speed__marks">
            {COMMON_RATES.map((value) => (
              <button
                key={value}
                type="button"
                className={`speed__mark${Math.abs(value - rate) < 0.001 ? ' speed__mark--on' : ''}`}
                onClick={() => onChange(value)}
              >
                {formatRate(value)}×
              </button>
            ))}
          </div>
        </div>
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
