import { useCallback, useRef, useState } from 'react'
import type { IngestProgress } from '../lib/pdf/ingest'

interface Props {
  onFile: (file: File) => void
  busy: IngestProgress | null
  error: string | null
}

export function UploadDropzone({ onFile, busy, error }: Props) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  const handleFiles = useCallback(
    (files: FileList | null) => {
      const file = Array.from(files ?? []).find((candidate) => candidate.type === 'application/pdf' || /\.pdf$/i.test(candidate.name))
      if (file) onFile(file)
    },
    [onFile],
  )

  return (
    <div
      className={`dropzone${dragging ? ' dropzone--active' : ''}${busy ? ' dropzone--busy' : ''}`}
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
        <div className="dropzone__progress">
          <p>{describe(busy)}</p>
          <div className="bar">
            <div className="bar__fill" style={{ width: `${Math.round(busy.fraction * 100)}%` }} />
          </div>
        </div>
      ) : (
        <>
          <h2>Drop a PDF here</h2>
          <p className="muted">It is read, converted and stored entirely on this device.</p>
          <button type="button" className="button" onClick={() => inputRef.current?.click()}>
            Choose a PDF
          </button>
        </>
      )}

      {error ? <p className="error" role="alert">{error}</p> : null}
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
