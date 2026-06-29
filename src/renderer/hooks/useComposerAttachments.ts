import { useState } from 'react'
import type { ClipboardEvent, DragEvent } from 'react'
import type { Attachment } from '@shared/ipc'
import { filesFromTransfer, filesToAttachments, pickAttachments } from '../features/chat/attachmentIntake'

/** Composer intake handlers — picker, clipboard paste, drag-drop — that forward
 *  the resulting Attachments to `onAdd`. Stateless about the list itself (the
 *  caller stores it): the whole-document chat keeps a local list (see
 *  useComposerAttachments); the per-block cards dispatch into the task reducer. */
export interface AttachmentIntake {
  /** True while a file is dragged over the composer (drop-ring affordance). */
  dragging: boolean
  /** Open the OS file picker and add the chosen files. */
  pick: () => void
  /** Add a clipboard image when one is pasted (plain-text pastes pass through). */
  onPaste: (e: ClipboardEvent) => void
  onDragOver: (e: DragEvent) => void
  onDragLeave: (e: DragEvent) => void
  onDrop: (e: DragEvent) => void
}

export function useAttachmentIntake(onAdd: (items: Attachment[]) => void): AttachmentIntake {
  const [dragging, setDragging] = useState(false)
  const addFiles = (files: File[]): void => {
    if (files.length) void filesToAttachments(files).then((items) => items.length && onAdd(items))
  }
  return {
    dragging,
    pick: () => void pickAttachments().then((items) => items.length && onAdd(items)),
    onPaste: (e) => {
      const files = filesFromTransfer(e.clipboardData)
      if (!files.length) return // plain-text paste → let the textarea handle it
      e.preventDefault()
      addFiles(files)
    },
    onDragOver: (e) => {
      e.preventDefault()
      setDragging(true)
    },
    onDragLeave: (e) => {
      e.preventDefault()
      setDragging(false)
    },
    onDrop: (e) => {
      e.preventDefault()
      setDragging(false)
      addFiles(filesFromTransfer(e.dataTransfer))
    },
  }
}

export interface ComposerAttachments extends AttachmentIntake {
  attachments: Attachment[]
  remove: (id: string) => void
  clear: () => void
}

/** Local attachment state + intake for a composer that owns its own draft — the
 *  whole-document chat. The per-block cards stage into the task reducer instead
 *  and call useAttachmentIntake directly. */
export function useComposerAttachments(): ComposerAttachments {
  const [attachments, setAttachments] = useState<Attachment[]>([])
  const intake = useAttachmentIntake((items) => setAttachments((prev) => [...prev, ...items]))
  return {
    ...intake,
    attachments,
    remove: (id) => setAttachments((prev) => prev.filter((a) => a.id !== id)),
    clear: () => setAttachments([]),
  }
}
