import { useState } from 'react'
import type { JSX } from 'react'
import { Camera, Check, Paperclip, Plus } from 'lucide-react'
import { IconButton, Tooltip } from '@renderer/components'
import { FileContextMenu } from '../workspace/FileContextMenu'
import type { ContextMenuEntry } from '../workspace/FileContextMenu'

interface Props {
  /** Open the OS file picker (images / PDF / text). Omit where attaching files
   *  isn't offered. */
  onPickFiles?: () => void
  /** Snapshot the anchor block's rendered output. Omit on whole-document
   *  composers (no block to capture). */
  onSnapshot?: () => void
  /** A snapshot is already staged → the menu offers to remove it. */
  hasSnapshot?: boolean
  disabled?: boolean
}

/** The composer's single attach control. With one source it's a bare icon
 *  (paperclip, or the snapshot camera); with both it collapses to a ＋ that opens
 *  a menu — so the two actions never sit as a cramped pair of icons. Reuses the
 *  shared cursor-anchored popover, opened just under the button. */
export function AttachMenu({ onPickFiles, onSnapshot, hasSnapshot, disabled }: Props): JSX.Element | null {
  const [menu, setMenu] = useState<{ x: number; y: number } | null>(null)
  const canSnapshot = !!onSnapshot
  const canFiles = !!onPickFiles
  if (!canSnapshot && !canFiles) return null

  // A single source needs no menu — show its own icon directly.
  if (canSnapshot !== canFiles) {
    const single = canFiles
      ? { label: 'Attach files', icon: <Paperclip size={14} />, run: onPickFiles!, active: false }
      : {
          label: hasSnapshot ? 'Remove snapshot' : 'Attach snapshot',
          icon: hasSnapshot ? <Check size={14} /> : <Camera size={14} />,
          run: onSnapshot!,
          active: !!hasSnapshot,
        }
    return (
      <Tooltip label={single.label} side="top">
        <IconButton size="sm" variant="ghost" active={single.active} disabled={disabled} label={single.label} onClick={single.run}>
          {single.icon}
        </IconButton>
      </Tooltip>
    )
  }

  const items: ContextMenuEntry[] = [
    {
      label: hasSnapshot ? 'Remove snapshot' : 'Snapshot block',
      icon: hasSnapshot ? <Check size={15} /> : <Camera size={15} />,
      onSelect: onSnapshot!,
    },
    { label: 'Attach files…', icon: <Paperclip size={15} />, onSelect: onPickFiles! },
  ]
  return (
    <>
      <Tooltip label="Attach" side="top">
        <IconButton
          size="sm"
          variant="ghost"
          active={!!menu || !!hasSnapshot}
          disabled={disabled}
          label="Attach"
          onClick={(e) => {
            const r = (e.currentTarget as HTMLElement).getBoundingClientRect()
            setMenu({ x: r.left, y: r.bottom + 4 })
          }}
        >
          <Plus size={15} />
        </IconButton>
      </Tooltip>
      {menu && <FileContextMenu x={menu.x} y={menu.y} items={items} onClose={() => setMenu(null)} />}
    </>
  )
}
