import { useEffect, useRef, useState } from 'react'
import type { ClipboardEvent, JSX } from 'react'
import { AlertTriangle, FolderOpen, ImagePlus, X } from 'lucide-react'
import { Button, Modal } from '@renderer/components'
import { client } from '@renderer/lib/client'
import { filesFromTransfer, filesToAttachments } from '@renderer/features/chat/attachmentIntake'
import { getGeometry } from '@renderer/features/paper/geometryBus'
import type {
  Attachment,
  BugReportInput,
  BugReportResult,
  DocumentInfo,
  GeometrySnapshot,
} from '@shared/ipc'

interface Props {
  open: boolean
  /** The open document — supplies docPath; null on the home screen. */
  doc: DocumentInfo | null
  onClose: () => void
}

type Status = 'idle' | 'saving' | 'done' | 'error'

/** In-app bug reporter (alpha dogfood). Collects a description, pasted/picked
 *  images, and the current block-geometry snapshot (with overlaps already
 *  detected), then writes a report folder under userData via main. */
export function BugReportDialog({ open, doc, onClose }: Props): JSX.Element | null {
  const [description, setDescription] = useState('')
  const [images, setImages] = useState<Attachment[]>([])
  const [geo, setGeo] = useState<GeometrySnapshot | null>(null)
  const [status, setStatus] = useState<Status>('idle')
  const [result, setResult] = useState<BugReportResult | null>(null)
  const [errorMsg, setErrorMsg] = useState('')
  const fileInput = useRef<HTMLInputElement>(null)

  // Snapshot the geometry showing right now, and reset the form, each time the
  // dialog opens — so a fresh report starts clean and captures the live view.
  useEffect(() => {
    if (!open) return
    setGeo(getGeometry())
    setDescription('')
    setImages([])
    setStatus('idle')
    setResult(null)
    setErrorMsg('')
  }, [open])

  if (!open) return null

  const addImages = (files: File[]): void => {
    if (!files.length) return
    void filesToAttachments(files).then((items) => {
      const imgs = items.filter((a) => a.kind === 'image' && a.dataUrl)
      if (imgs.length) setImages((prev) => [...prev, ...imgs])
    })
  }
  const onPaste = (e: ClipboardEvent): void => {
    const files = filesFromTransfer(e.clipboardData)
    if (!files.length) return // plain text → let the textarea handle it
    e.preventDefault()
    addImages(files)
  }

  const submit = (): void => {
    setStatus('saving')
    const input: BugReportInput = {
      description: description.trim(),
      images: images.map((a) => ({ name: a.name, dataUrl: a.dataUrl as string })),
      docPath: doc?.root,
      geometry: geo ?? undefined,
    }
    void client.submitBugReport(input).then(
      (res) => {
        setResult(res)
        setStatus('done')
      },
      (err) => {
        setErrorMsg(err instanceof Error ? err.message : String(err))
        setStatus('error')
      },
    )
  }

  const overlapCount = geo?.overlaps.length ?? 0
  const canSubmit = description.trim().length > 0 && status !== 'saving'

  const footer =
    status === 'done' && result ? (
      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8 }}>
        <Button
          variant="secondary"
          iconLeft={<FolderOpen size={15} />}
          onClick={() => void client.revealBugReport(result.dir)}
        >
          Reveal in Finder
        </Button>
        <Button onClick={onClose}>Done</Button>
      </div>
    ) : (
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12 }}>
        <span style={{ font: 'var(--text-sm)/1.3 var(--font-sans)', color: 'var(--del-600)' }}>
          {status === 'error' ? errorMsg : ''}
        </span>
        <div style={{ display: 'flex', gap: 8 }}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button onClick={submit} loading={status === 'saving'} disabled={!canSubmit}>
            Submit report
          </Button>
        </div>
      </div>
    )

  return (
    <Modal title="Report a bug" onClose={onClose} testid="bug-report-modal" footer={footer}>
      <div style={{ padding: '16px 18px', display: 'flex', flexDirection: 'column', gap: 14 }}>
        {status === 'done' && result ? (
          <p style={{ margin: 0, font: 'var(--text-base)/1.5 var(--font-sans)', color: 'var(--ink-700)' }}>
            Report saved. The folder holds your note, any images, and a geometry
            snapshot — reveal it to inspect or hand it to a fix session.
          </p>
        ) : (
          <>
            <textarea
              autoFocus
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              onPaste={onPaste}
              placeholder="What happened? What did you expect instead? (Paste a screenshot here, or use Add image.)"
              rows={6}
              style={{
                width: '100%',
                resize: 'vertical',
                padding: '10px 12px',
                font: 'var(--text-base)/1.5 var(--font-sans)',
                color: 'var(--text-body)',
                background: 'var(--surface-well)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                boxSizing: 'border-box',
              }}
            />

            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <Button
                variant="secondary"
                size="sm"
                iconLeft={<ImagePlus size={15} />}
                onClick={() => fileInput.current?.click()}
              >
                Add image
              </Button>
              <span style={{ font: 'var(--text-sm)/1 var(--font-sans)', color: 'var(--ink-400)' }}>
                or paste a screenshot into the box
              </span>
              <input
                ref={fileInput}
                type="file"
                accept="image/*"
                multiple
                style={{ display: 'none' }}
                onChange={(e) => {
                  addImages([...(e.target.files ?? [])])
                  e.currentTarget.value = ''
                }}
              />
            </div>

            {images.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {images.map((img) => (
                  <Thumb key={img.id} img={img} onRemove={() => setImages((p) => p.filter((a) => a.id !== img.id))} />
                ))}
              </div>
            )}

            <ContextSummary doc={doc} geo={geo} overlapCount={overlapCount} />
          </>
        )}
      </div>
    </Modal>
  )
}

function Thumb({ img, onRemove }: { img: Attachment; onRemove: () => void }): JSX.Element {
  return (
    <div
      style={{
        position: 'relative',
        width: 72,
        height: 72,
        borderRadius: 'var(--radius-sm)',
        overflow: 'hidden',
        border: '1px solid var(--border-default)',
        background: 'var(--surface-well)',
      }}
    >
      <img
        src={img.thumbDataUrl ?? img.dataUrl}
        alt={img.name}
        style={{ width: '100%', height: '100%', objectFit: 'cover' }}
      />
      <button
        type="button"
        aria-label={`Remove ${img.name}`}
        onClick={onRemove}
        style={{
          position: 'absolute',
          top: 2,
          right: 2,
          display: 'inline-flex',
          padding: 2,
          borderRadius: '50%',
          border: 'none',
          background: 'rgba(33, 30, 25, 0.62)',
          color: '#fff',
          cursor: 'pointer',
        }}
      >
        <X size={12} />
      </button>
    </div>
  )
}

function ContextSummary({
  doc,
  geo,
  overlapCount,
}: {
  doc: DocumentInfo | null
  geo: GeometrySnapshot | null
  overlapCount: number
}): JSX.Element {
  const docName = doc ? (doc.root.split('/').pop() ?? doc.root) : '(no document open)'
  return (
    <div
      style={{
        padding: '10px 12px',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-well)',
        border: '1px solid var(--border-faint)',
        font: 'var(--text-sm)/1.5 var(--font-sans)',
        color: 'var(--ink-500)',
      }}
    >
      <div>
        Attached automatically: document (<strong>{docName}</strong>), app version, and recent errors.
      </div>
      {!geo ? (
        <div style={{ marginTop: 4 }}>Compile a document to capture block positions.</div>
      ) : overlapCount > 0 ? (
        <div
          style={{ marginTop: 4, display: 'flex', alignItems: 'center', gap: 6, color: 'var(--del-600)' }}
        >
          <AlertTriangle size={14} />
          {overlapCount} overlapping block {overlapCount === 1 ? 'pair' : 'pairs'} detected on the
          current view — captured in the report.
        </div>
      ) : (
        <div style={{ marginTop: 4 }}>
          Block positions captured; no overlaps detected on the current view.
        </div>
      )}
    </div>
  )
}
