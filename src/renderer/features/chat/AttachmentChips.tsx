import type { JSX } from 'react'
import { FileText, X } from 'lucide-react'
import type { Attachment } from '@shared/ipc'

interface Props {
  attachments: Attachment[]
  /** Remove one chip by id. */
  onRemove: (id: string) => void
}

/** The staged-attachment strip above a composer: a thumbnail for images and the
 *  block snapshot, a document glyph + name for PDFs/text. Each chip removes on ×.
 *  Shared by the whole-doc chat and the per-block / thread composers. Renders
 *  nothing when empty. */
export function AttachmentChips({ attachments, onRemove }: Props): JSX.Element | null {
  if (!attachments.length) return null
  return (
    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginBottom: 6 }}>
      {attachments.map((att) => (
        <Chip key={att.id} att={att} onRemove={() => onRemove(att.id)} />
      ))}
    </div>
  )
}

function Chip({ att, onRemove }: { att: Attachment; onRemove: () => void }): JSX.Element {
  const isImage = att.kind === 'image' || att.kind === 'snapshot'
  const label = att.kind === 'snapshot' ? 'block snapshot' : att.name
  return (
    <span
      title={label}
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 6,
        maxWidth: 180,
        height: 26,
        padding: isImage && att.thumbDataUrl ? '0 6px 0 0' : '0 4px 0 8px',
        border: '1px solid var(--border-default)',
        borderRadius: 'var(--radius-sm)',
        background: 'var(--surface-app)',
        font: 'var(--weight-medium) var(--text-2xs)/1 var(--font-sans)',
        color: 'var(--ink-600)'
      }}
    >
      {isImage && att.thumbDataUrl ? (
        <img
          src={att.thumbDataUrl}
          alt=""
          aria-hidden
          style={{
            width: 26,
            height: 26,
            objectFit: 'cover',
            borderRadius: 'var(--radius-sm) 0 0 var(--radius-sm)',
            display: 'block'
          }}
        />
      ) : (
        <FileText size={13} color="var(--ink-400)" aria-hidden />
      )}
      <span
        style={{ maxWidth: 110, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
      >
        {label}
      </span>
      <button
        type="button"
        aria-label={`Remove ${label}`}
        onClick={onRemove}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          height: 16,
          width: 16,
          padding: 0,
          border: 'none',
          borderRadius: 'var(--radius-xs)',
          background: 'transparent',
          color: 'var(--ink-400)',
          cursor: 'pointer'
        }}
      >
        <X size={12} />
      </button>
    </span>
  )
}
