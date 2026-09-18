import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { charOffsetAtPoint, hasTextSelection } from './caret'
import { toSpeech, tokenIndexAtCharOffset } from '../lib/text/normalize'
import type { Chunk } from '../lib/pdf/types'

interface Props {
  chunks: Chunk[]
  index: number
  tokenIndex: number
  /** True when the engine reports word boundaries; otherwise only the chunk is highlighted. */
  wordHighlighting: boolean
  /** Start reading at a chunk, and at a word within it. */
  onStartAt: (index: number, token: number) => void
}

/** How many chunks either side of the current one are kept in the DOM. */
const WINDOW = 120

/**
 * How long the active passage must stay off screen before the pill appears.
 * Auto-scrolling takes it out of view for a moment on every chunk change, and a
 * pill that blinks once a paragraph is worse than no pill at all.
 */
const OFF_SCREEN_DELAY = 500

/** A paragraph or heading on the page: a run of chunks rendered as one block. */
interface Block {
  key: number
  heading: boolean
  chunks: Chunk[]
}

/**
 * Chunks are a synthesis unit, not a layout unit — several of them usually make
 * up one paragraph. Grouping them back together is what keeps the page reading
 * as prose rather than as a list of sentences.
 */
function groupIntoBlocks(chunks: Chunk[]): Block[] {
  const blocks: Block[] = []
  for (const chunk of chunks) {
    const open = blocks[blocks.length - 1]
    const continues =
      open !== undefined &&
      !open.heading &&
      chunk.heading !== true &&
      !chunk.startsParagraph &&
      chunk.paragraph === open.chunks[0].paragraph
    if (continues) open.chunks.push(chunk)
    else blocks.push({ key: chunk.index, heading: chunk.heading === true, chunks: [chunk] })
  }
  return blocks
}

export function Transcript({ chunks, index, tokenIndex, wordHighlighting, onStartAt }: Props) {
  const activeRef = useRef<HTMLSpanElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  /** Which way the reader has drifted from the passage, or null while it is in view. */
  const [strayed, setStrayed] = useState<'up' | 'down' | null>(null)

  const view = useMemo(() => {
    const start = Math.max(0, index - WINDOW)
    const end = Math.min(chunks.length, index + WINDOW)
    return { start, items: chunks.slice(start, end) }
  }, [chunks, index])

  const blocks = useMemo(() => groupIntoBlocks(view.items), [view.items])

  const scrollToActive = useCallback(() => {
    activeRef.current?.scrollIntoView({ block: 'center', behavior: 'smooth' })
  }, [])

  useEffect(() => {
    scrollToActive()
  }, [index, scrollToActive])

  // The pill is driven by whether the passage is actually on screen rather than
  // by scroll position, so it stays right however the column is laid out.
  useEffect(() => {
    setStrayed(null)
    const target = activeRef.current
    if (!target || typeof IntersectionObserver === 'undefined') return

    let timer = 0
    const observer = new IntersectionObserver(
      ([entry]) => {
        window.clearTimeout(timer)
        if (entry.isIntersecting) {
          setStrayed(null)
          return
        }
        timer = window.setTimeout(() => {
          const bounds = containerRef.current?.getBoundingClientRect()
          const rect = target.getBoundingClientRect()
          setStrayed(rect.bottom < (bounds?.top ?? 0) ? 'up' : 'down')
        }, OFF_SCREEN_DELAY)
      },
      { threshold: 0 },
    )
    observer.observe(target)
    return () => {
      window.clearTimeout(timer)
      observer.disconnect()
    }
  }, [index])

  const tokens = useMemo(
    () => (chunks[index] ? toSpeech(chunks[index].text).tokens : []),
    [chunks, index],
  )

  /** A click anywhere in the text means "read from this word". */
  const handleClick = (event: React.MouseEvent<HTMLSpanElement>, chunk: Chunk) => {
    // Dragging out a selection is reading, not seeking.
    if (hasTextSelection()) return

    const span = (event.target as HTMLElement).closest<HTMLElement>('[data-token]')
    if (span?.dataset.token !== undefined) {
      onStartAt(chunk.index, Number(span.dataset.token))
      return
    }

    // currentTarget is the chunk's own span, so the offset is an offset into
    // exactly the text the chunk was built from.
    const offset = charOffsetAtPoint(event.currentTarget, event.clientX, event.clientY)
    onStartAt(chunk.index, offset === null ? 0 : tokenIndexAtCharOffset(chunk.text, offset))
  }

  const renderChunk = (chunk: Chunk, position: number) => {
    const active = chunk.index === index
    const className = active ? 'transcript__chunk transcript__chunk--active' : 'transcript__chunk'

    return (
      <Fragment key={chunk.index}>
        {/* The separator sits outside the span so it is not swept into the highlight. */}
        {position > 0 ? ' ' : null}
        <span
          ref={active ? activeRef : undefined}
          className={className}
          onClick={(event) => handleClick(event, chunk)}
          title={`Page ${chunk.page} — click any word to read from there`}
        >
          {active && wordHighlighting && tokenIndex >= 0
            ? tokens.map((token, i) => (
                <Fragment key={i}>
                  {i > 0 ? ' ' : null}
                  <span
                    data-token={i}
                    className={i === tokenIndex ? 'word word--current' : 'word'}
                  >
                    {token}
                  </span>
                </Fragment>
              ))
            : chunk.text}
        </span>
      </Fragment>
    )
  }

  return (
    <div className="transcript" ref={containerRef}>
      <div className="transcript__column">
        {view.start > 0 ? <p className="muted transcript__edge">…earlier text hidden…</p> : null}

        {blocks.map((block) =>
          block.heading ? (
            <h2 key={block.key} className="transcript__heading">
              {block.chunks.map(renderChunk)}
            </h2>
          ) : (
            <p key={block.key} className="transcript__paragraph">
              {block.chunks.map(renderChunk)}
            </p>
          ),
        )}

        {view.start + view.items.length < chunks.length ? (
          <p className="muted transcript__edge">…later text hidden…</p>
        ) : null}

        <div className="transcript__anchor">
          {strayed ? (
            <button type="button" className="transcript__back" onClick={scrollToActive}>
              <span aria-hidden="true">{strayed === 'up' ? '↑' : '↓'}</span>
              Back to current
            </button>
          ) : null}
        </div>
      </div>
    </div>
  )
}
