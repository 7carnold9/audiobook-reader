import { useEffect } from 'react'

interface MediaSessionOptions {
  title: string
  artist: string | null
  playing: boolean
  onPlay: () => void
  onPause: () => void
  onNext: () => void
  onPrevious: () => void
}

/**
 * Wires lock-screen and headset controls. Long playback sessions are the norm
 * for an audiobook, so this is part of the MVP rather than polish.
 */
export function useMediaSession({
  title,
  artist,
  playing,
  onPlay,
  onPause,
  onNext,
  onPrevious,
}: MediaSessionOptions): void {
  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    const session = navigator.mediaSession
    session.metadata = new MediaMetadata({
      title,
      artist: artist ?? 'Audiobook Reader',
    })
    session.setActionHandler('play', onPlay)
    session.setActionHandler('pause', onPause)
    session.setActionHandler('nexttrack', onNext)
    session.setActionHandler('previoustrack', onPrevious)
    return () => {
      session.setActionHandler('play', null)
      session.setActionHandler('pause', null)
      session.setActionHandler('nexttrack', null)
      session.setActionHandler('previoustrack', null)
    }
  }, [title, artist, onPlay, onPause, onNext, onPrevious])

  useEffect(() => {
    if (!('mediaSession' in navigator)) return
    navigator.mediaSession.playbackState = playing ? 'playing' : 'paused'
  }, [playing])
}

/** Keeps the screen awake while narrating, where the browser supports it. */
export function useWakeLock(active: boolean): void {
  useEffect(() => {
    if (!active || !('wakeLock' in navigator)) return
    let sentinel: WakeLockSentinel | null = null
    let released = false

    void navigator.wakeLock
      .request('screen')
      .then((lock) => {
        if (released) void lock.release()
        else sentinel = lock
      })
      .catch(() => undefined)

    return () => {
      released = true
      void sentinel?.release().catch(() => undefined)
    }
  }, [active])
}
