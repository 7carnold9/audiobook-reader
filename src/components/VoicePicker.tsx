import { useEffect, useRef, useState } from 'react'
import { MAX_FAVOURITES, orderVoices, searchVoices, toggleFavourite } from '../lib/tts'
import type { SpeechHandle, TtsProvider, TtsVoice } from '../lib/tts'

interface Props {
  provider: TtsProvider | undefined
  voices: TtsVoice[]
  voiceId: string | null
  favourites: string[]
  /** Text to read when previewing, normally the passage currently on screen. */
  sample: string
  rate: number
  onVoiceChange: (id: string) => void
  onFavouritesChange: (favourites: string[]) => void
  onClose: () => void
}

/**
 * Browse every voice the engine offers, hear it on the passage you are reading,
 * and star the few worth keeping. The starred ones become buttons in the player
 * bar so switching later takes one click.
 */
export function VoicePicker({
  provider,
  voices,
  voiceId,
  favourites,
  sample,
  rate,
  onVoiceChange,
  onFavouritesChange,
  onClose,
}: Props) {
  const [query, setQuery] = useState('')
  // The list is ordered once, when the panel opens: re-sorting as voices are
  // starred would move the row out from under the cursor.
  const [orderedBy] = useState(favourites)
  const [previewing, setPreviewing] = useState<string | null>(null)
  const handleRef = useRef<SpeechHandle | null>(null)

  const stopPreview = () => {
    handleRef.current?.stop()
    handleRef.current = null
    setPreviewing(null)
  }

  // Never leave a voice talking after the panel closes.
  useEffect(() => () => handleRef.current?.stop(), [])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [onClose])

  const preview = (voice: TtsVoice) => {
    if (!provider) return
    if (previewing === voice.id) {
      stopPreview()
      return
    }
    stopPreview()
    setPreviewing(voice.id)
    handleRef.current = provider.speak({
      text: sample,
      rate,
      voiceId: voice.id,
      onEnd: () => {
        handleRef.current = null
        setPreviewing(null)
      },
    })
  }

  const listed = searchVoices(orderVoices(voices, orderedBy, navigator.language), query)
  const full = favourites.length >= MAX_FAVOURITES

  return (
    <div className="drawer" role="dialog" aria-modal="true" aria-label="Voices" onClick={onClose}>
      <div className="drawer__panel" onClick={(event) => event.stopPropagation()}>
        <header className="drawer__header">
          <div className="drawer__title">
            <h2>Voices</h2>
            <button type="button" className="iconbutton" onClick={onClose} aria-label="Close voices">
              ×
            </button>
          </div>
          <p className="muted">
            Star up to {MAX_FAVOURITES} to keep them one click away. Previews read the passage
            you are on.
          </p>
          <input
            type="search"
            className="drawer__search"
            placeholder="Search by name or language…"
            value={query}
            autoFocus
            onChange={(event) => setQuery(event.target.value)}
          />
        </header>

        <ul className="voices">
          {listed.map((voice) => {
            const starred = favourites.includes(voice.id)
            return (
              <li key={voice.id} className={`voices__row${voice.id === voiceId ? ' voices__row--current' : ''}`}>
                <button
                  type="button"
                  className={`voices__star${starred ? ' voices__star--on' : ''}`}
                  aria-pressed={starred}
                  disabled={!starred && full}
                  title={
                    starred
                      ? 'Remove from the shortlist'
                      : full
                        ? `Shortlist is full — unstar one of the ${MAX_FAVOURITES} first`
                        : 'Add to the shortlist'
                  }
                  onClick={() => onFavouritesChange(toggleFavourite(favourites, voice.id))}
                >
                  {starred ? '★' : '☆'}
                </button>
                <button type="button" className="voices__name" onClick={() => onVoiceChange(voice.id)}>
                  <span>{voice.name}</span>
                  <span className="muted">{voice.lang}</span>
                </button>
                <button type="button" className="button button--ghost voices__preview" onClick={() => preview(voice)}>
                  {previewing === voice.id ? '■ Stop' : '▶ Preview'}
                </button>
              </li>
            )
          })}
          {listed.length === 0 ? <li className="muted voices__empty">No voice matches that.</li> : null}
        </ul>

        <footer className="drawer__footer">
          <span className="muted">
            {favourites.length} of {MAX_FAVOURITES} starred
          </span>
          <button type="button" className="button button--primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
