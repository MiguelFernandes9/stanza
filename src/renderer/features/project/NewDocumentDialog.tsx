import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { FolderOpen, Plus } from 'lucide-react'
import { Button, Input } from '@renderer/components'
import { client } from '@renderer/lib/client'

interface Props {
  onCreate: (args: { name: string; dir: string }) => void
  onCancel: () => void
}

const NAME_OK = /^[^/\\:*?"<>|]+$/

/** New-document collection (BUG B): the design's "New document" variant needs
 *  a real name + parent directory before document:create — the backend writes
 *  <dir>/<name>/main.tex and rejects a non-absolute dir. */
export function NewDocumentDialog({ onCreate, onCancel }: Props): JSX.Element {
  const [name, setName] = useState('untitled-paper')
  const [dir, setDir] = useState<string | null>(null)

  useEffect(() => {
    const onKey = (e: KeyboardEvent): void => {
      if (e.key === 'Escape') onCancel()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onCancel])

  const trimmed = name.trim()
  const nameValid = trimmed.length > 0 && NAME_OK.test(trimmed)
  const canCreate = nameValid && dir != null

  const chooseDir = async (): Promise<void> => {
    const picked = await client.dialogPickDirectory()
    if (picked) setDir(picked)
  }

  const submit = (): void => {
    if (canCreate && dir) onCreate({ name: trimmed, dir })
  }

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 100,
        background: 'rgba(33, 30, 25, 0.42)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        animation: 'stz-fade-up 160ms var(--ease-out)'
      }}
      onClick={onCancel}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        style={{
          width: 420,
          background: 'var(--paper-1)',
          border: '1px solid var(--border-strong)',
          borderRadius: 'var(--radius-xl)',
          boxShadow: 'var(--shadow-xl)',
          padding: '20px 22px'
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 9, marginBottom: 4 }}>
          <Plus size={16} style={{ color: 'var(--clay-500)' }} />
          <span style={{ font: 'var(--weight-semibold) var(--text-md)/1.2 var(--font-sans)', color: 'var(--ink-900)' }}>
            New document
          </span>
        </div>
        <div style={{ font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-500)', marginBottom: 16 }}>
          A minimal article project, primed and version-controlled on creation.
        </div>

        <label style={{ display: 'block', marginBottom: 14 }}>
          <span
            style={{
              display: 'block',
              font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)',
              letterSpacing: 'var(--tracking-caps)',
              textTransform: 'uppercase',
              color: 'var(--ink-400)',
              marginBottom: 6
            }}
          >
            Name
          </span>
          <Input
            autoFocus
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') submit()
            }}
            invalid={name.length > 0 && !nameValid}
            placeholder="untitled-paper"
          />
        </label>

        <label style={{ display: 'block', marginBottom: 4 }}>
          <span
            style={{
              display: 'block',
              font: 'var(--weight-bold) var(--text-2xs)/1 var(--font-sans)',
              letterSpacing: 'var(--tracking-caps)',
              textTransform: 'uppercase',
              color: 'var(--ink-400)',
              marginBottom: 6
            }}
          >
            Location
          </span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <div
              style={{
                flex: 1,
                minWidth: 0,
                height: 'var(--control-h-md)',
                display: 'flex',
                alignItems: 'center',
                padding: '0 10px',
                background: 'var(--surface-well)',
                border: '1px solid var(--border-default)',
                borderRadius: 'var(--radius-md)',
                font: 'var(--text-xs)/1 var(--font-mono)',
                color: dir ? 'var(--ink-700)' : 'var(--ink-400)',
                whiteSpace: 'nowrap',
                overflow: 'hidden',
                textOverflow: 'ellipsis'
              }}
              title={dir ?? undefined}
            >
              {dir ? `${dir}/${trimmed || 'untitled-paper'}` : 'Choose a folder…'}
            </div>
            <Button size="md" variant="secondary" iconLeft={<FolderOpen size={15} />} onClick={() => void chooseDir()}>
              Choose…
            </Button>
          </div>
        </label>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 18 }}>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
          <Button size="sm" variant="primary" disabled={!canCreate} onClick={submit}>
            Create
          </Button>
        </div>
      </div>
    </div>
  )
}
