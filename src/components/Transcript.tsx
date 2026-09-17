import { useEffect, useMemo, useRef } from 'react'
import { toSpeech } from '../lib/text/normalize'
import type { Chunk } from '../lib/pdf/types'

interface Props {
  chunks: Chunk[]
  index: number
  tokenIndex: number
  /** True when the engine reports word boundaries; otherwise only the chunk is highlighted. */
  wordHighlighting: boolean
  onSeek: (index: number) => void
}

/** How many chunks either side of the current one are kept in the DOM. */
const WINDOW = 120

export function Transcript({ chunks, index, tokenIndex, wordHighlighting, onSeek }: Props) {
  const activeRef = useRef<HTMLParagraphElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)

  const window = useMemo(() => {
    const start = Math.max(0, index - WINDOW)
    const end = Math.min(chunks.length, index + WINDOW)
    return { start, items: chunks.slice(start, end) }
  }, [chunks, index])

  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [index])

  const tokens = useMemo(
    () => (chunks[index] ? toSpeech(chunks[index].text).tokens : []),
    [chunks, index],
  )

  return (
    <div className="transcript" ref={containerRef}>
      {window.start > 0 ? <p className="muted transcript__edge">…earlier text hidden…</p> : null}
      {window.items.map((chunk) => {
        const active = chunk.index === index
        const className = [
          'transcript__chunk',
          chunk.heading ? 'transcript__chunk--heading' : '',
          chunk.startsParagraph ? 'transcript__chunk--paragraph' : '',
          active ? 'transcript__chunk--active' : '',
        ]
          .filter(Boolean)
          .join(' ')

        return (
          <p
            key={chunk.index}
            ref={active ? activeRef : undefined}
            className={className}
            onClick={() => onSeek(chunk.index)}
            title={`Page ${chunk.page} — click to jump here`}
          >
            {active && wordHighlighting && tokenIndex >= 0
              ? tokens.map((token, i) => (
                  <span key={i} className={i === tokenIndex ? 'word word--current' : 'word'}>
                    {token}{' '}
                  </span>
                ))
              : chunk.text}
          </p>
        )
      })}
      {window.start + window.items.length < chunks.length ? (
        <p className="muted transcript__edge">…later text hidden…</p>
      ) : null}
    </div>
  )
}
