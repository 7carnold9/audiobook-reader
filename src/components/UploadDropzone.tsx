import { useCallback, useRef, useState } from 'react'
import type { IngestProgress } from '../lib/pdf/ingest'

interface Props {
  onFile: (file: File) => void
  busy: IngestProgress | null
  error: string | null
  /**
   * 'empty' is the full pitch that stands in for an empty shelf; 'add' is the
   * quiet strip that sits under a shelf that already has books on it. Both drop
   * and click the same way.
   */
  variant?: 'empty' | 'add'
}

export function UploadDropzone({ onFile, busy, error, variant = 'empty' }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = Array.from(files ?? []).find((candidate) => candidate.type === 'application/pdf' || /\.pdf$/i.test(candidate.name))
      if (file) onFile(file)
    },
    [onFile],
  )

  const classes = [
    'uploader',
    `uploader--${variant}`,
    dragging ? 'uploader--active' : '',
    busy ? 'uploader--busy' : '',
  ]
    .filter(Boolean)
    .join(' ')

  return (
    <div
      className={classes}
      onDragOver={(event) => {
        event.preventDefault()
        setDragging(true)
      }}
      onDragLeave={() => setDragging(false)}
      onDrop={(event) => {
        event.preventDefault()
        setDragging(false)
        handleFiles(event.dataTransfer.files)
      }}
    >
      <input
        ref={inputRef}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(event) => {
          handleFiles(event.target.files)
          event.target.value = ''
        }}
      />

      {busy ? (
        <div className="uploader__progress">
          <p className="uploader__stage">{describe(busy)}</p>
          <div
            className="uploader__bar"
            role="progressbar"
            aria-label="Preparing your book"
            aria-valuenow={Math.round(busy.fraction * 100)}
          >
            <div className="uploader__bar-fill" style={{ width: `${Math.round(busy.fraction * 100)}%` }} />
          </div>
        </div>
      ) : (
        <div className="uploader__pitch">
          <div className="uploader__words">
            <p className="uploader__lead">
              {variant === 'empty' ? 'Drop a PDF here to start listening' : 'Add another PDF'}
            </p>
            <p className="uploader__note">It is read, converted and stored entirely on this device.</p>
          </div>
          <button type="button" className="uploader__button" onClick={() => inputRef.current?.click()}>
            Choose a PDF
          </button>
        </div>
      )}

      {error ? (
        <p className="uploader__error" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  )
}

function describe(progress: IngestProgress): string {
  switch (progress.stage) {
    case 'reading':
      return 'Reading the file…'
    case 'extracting':
      return `Extracting text — page ${progress.page ?? 0} of ${progress.pageCount ?? '?'}`
    case 'cleaning':
      return 'Cleaning up layout and splitting into chunks…'
    default:
      return 'Done'
  }
}
