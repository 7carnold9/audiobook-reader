import { useEffect, useRef, useState } from 'react'
import { BEST_VOICE_COUNT, MAX_FAVOURITES, bestVoices, orderVoices, searchVoices, toggleFavourite } from '../lib/tts'
import type { SpeechHandle, TtsProvider, TtsVoice } from '../lib/tts'

interface Props {
  provider: TtsProvider | undefined
  voices: TtsVoice[]
  /** The voice this book is read in, whether its own or the inherited default. */
  voiceId: string | null
  /** The voice used by books that have none of their own. */
  defaultVoiceId: string | null
  defaultVoiceLabel: string | null
  bookTitle: string
  /** True while this book has no voice of its own and so follows the default. */
  followsDefault: boolean
  favourites: string[]
  /** Text to read when previewing, normally the passage currently on screen. */
  sample: string
  rate: number
  /** Sets the voice for this book alone. */
  onVoiceChange: (id: string) => void
  /** Also makes the chosen voice the default for books that have none. */
  onMakeDefault: () => void
  /** Drops this book's own voice, so it follows the default again. */
  onFollowDefault: () => void
  onFavouritesChange: (favourites: string[]) => void
  onClose: () => void
}

/**
 * Browse every voice the engine offers, hear it on the passage you are reading,
 * and star the few worth keeping. The starred ones become buttons in the player
 * bar so switching later takes one click. A choice here belongs to this book;
 * the scope band at the top says so, and offers the two ways out of it.
 */
export function VoicePicker({
  provider,
  voices,
  voiceId,
  defaultVoiceId,
  defaultVoiceLabel,
  bookTitle,
  followsDefault,
  favourites,
  sample,
  rate,
  onVoiceChange,
  onMakeDefault,
  onFollowDefault,
  onFavouritesChange,
  onClose,
}: Props) {
  const [query, setQuery] = useState('')
  // The list is ordered once, when the panel opens: re-sorting as voices are
  // starred would move the row out from under the cursor.
  const [orderedBy] = useState(favourites)
  const [previewing, setPreviewing] = useState<string | null>(null)
  /** The full list is a hundred voices in languages nobody here reads. */
  const [showAll, setShowAll] = useState(false)
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

  // Searching looks through everything; browsing shows only the good ones.
  const pool = showAll || query.trim() ? voices : bestVoices(voices, navigator.language)
  const listed = searchVoices(orderVoices(pool, orderedBy, navigator.language), query)
  const hidden = voices.length - pool.length
  const full = favourites.length >= MAX_FAVOURITES
  const currentLabel = voices.find((voice) => voice.id === voiceId)?.name ?? 'System voice'
  const isDefault = voiceId !== null && voiceId === defaultVoiceId

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
            The {BEST_VOICE_COUNT} best voices your system offers. Star up to {MAX_FAVOURITES} to
            keep them one click away; previews read the passage you are on.
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

        <div className="voicescope">
          <p className="voicescope__now">
            <span className={`voicescope__badge${followsDefault ? '' : ' voicescope__badge--own'}`}>
              {followsDefault ? 'Default voice' : 'This book'}
            </span>
            <span className="voicescope__voice">{currentLabel}</span>
          </p>
          <p className="voicescope__hint">
            {followsDefault
              ? `“${bookTitle}” has no voice of its own yet. Picking one below sets it for this book.`
              : `Picked for “${bookTitle}”. Other books keep the voice they were last read in.`}
          </p>
          <div className="voicescope__actions">
            <button
              type="button"
              className="button button--ghost voicescope__button"
              onClick={onMakeDefault}
              disabled={isDefault || !voiceId}
            >
              {isDefault
                ? '✓ Already the default for books with no voice of their own'
                : 'Also make it the default for books with no voice of their own'}
            </button>
            {followsDefault ? null : (
              <button
                type="button"
                className="button button--ghost voicescope__button"
                onClick={onFollowDefault}
              >
                Follow the default instead{defaultVoiceLabel ? ` (${defaultVoiceLabel})` : ''}
              </button>
            )}
          </div>
        </div>

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
                  {voice.id === defaultVoiceId ? <span className="voicetag">default</span> : null}
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
            {hidden > 0 && !query.trim() ? (
              <>
                {' · '}
                <button type="button" className="linkbutton" onClick={() => setShowAll(true)}>
                  show {hidden} more
                </button>
              </>
            ) : null}
            {showAll && !query.trim() ? (
              <>
                {' · '}
                <button type="button" className="linkbutton" onClick={() => setShowAll(false)}>
                  show the best {BEST_VOICE_COUNT}
                </button>
              </>
            ) : null}
          </span>
          <button type="button" className="button button--primary" onClick={onClose}>
            Done
          </button>
        </footer>
      </div>
    </div>
  )
}
