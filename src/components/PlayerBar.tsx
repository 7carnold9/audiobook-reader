import type { Player } from '../state/usePlayer'
import type { TtsProvider, TtsVoice } from '../lib/tts'

interface Props {
  player: Player
  onRateChange: (rate: number) => void
  page: number
  pageCount: number
  providers: TtsProvider[]
  providerId: string
  onProviderChange: (id: string) => void
  voices: TtsVoice[]
  voiceId: string | null
  onVoiceChange: (id: string) => void
}

const RATES = [0.75, 1, 1.25, 1.5, 1.75, 2, 2.5]

export function PlayerBar({
  player,
  onRateChange,
  page,
  pageCount,
  providers,
  providerId,
  onProviderChange,
  voices,
  voiceId,
  onVoiceChange,
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
        <span className="player__time">-{formatTime(Math.max(0, player.duration - player.elapsed))}</span>
      </div>

      <div className="player__row">
        <div className="player__transport">
          <button type="button" className="button button--ghost" onClick={() => player.skip(-10)} title="Back 10 chunks">
            ⏮
          </button>
          <button type="button" className="button button--ghost" onClick={() => player.skip(-1)} title="Previous chunk">
            ↺
          </button>
          <button type="button" className="button button--primary" onClick={player.toggle} title="Play / pause (space)">
            {playing ? '❚❚' : '▶'}
          </button>
          <button type="button" className="button button--ghost" onClick={() => player.skip(1)} title="Next chunk">
            ↻
          </button>
          <button type="button" className="button button--ghost" onClick={() => player.skip(10)} title="Forward 10 chunks">
            ⏭
          </button>
        </div>

        <div className="player__settings">
          <label>
            <span className="muted">Speed</span>
            <select value={player.rate} onChange={(event) => onRateChange(Number(event.target.value))}>
              {RATES.map((rate) => (
                <option key={rate} value={rate}>
                  {rate}×
                </option>
              ))}
            </select>
          </label>

          {providers.length > 1 ? (
            <label>
              <span className="muted">Engine</span>
              <select value={providerId} onChange={(event) => onProviderChange(event.target.value)}>
                {providers.map((provider) => (
                  <option key={provider.id} value={provider.id}>
                    {provider.name}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {voices.length ? (
            <label>
              <span className="muted">Voice</span>
              <select value={voiceId ?? ''} onChange={(event) => onVoiceChange(event.target.value)}>
                {voices.map((voice) => (
                  <option key={voice.id} value={voice.id}>
                    {voice.name} ({voice.lang})
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          <span className="muted player__page">
            page {page} / {pageCount}
          </span>
        </div>
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
