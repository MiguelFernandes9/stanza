import { useState } from 'react'
import type { DragEvent as ReactDragEvent } from 'react'

export type MovePlan = { ok: true; to: string } | { ok: false; reason: 'noop' | 'descendant' }

function parentDir(rel: string): string {
  const i = rel.lastIndexOf('/')
  return i >= 0 ? rel.slice(0, i) : ''
}
function baseName(rel: string): string {
  return rel.split('/').pop() ?? rel
}

/** Where a dragged path lands when dropped on `toDir` ('' = root), with the
 *  move guards (JSX-free, unit-tested): already in that dir → noop; a folder
 *  onto itself or a descendant → descendant. Collisions are left to the
 *  backend (it rejects with NAME_EXISTS, surfaced as a toast). */
export function planMove(from: string, toDir: string): MovePlan {
  if (parentDir(from) === toDir) return { ok: false, reason: 'noop' }
  if (toDir === from || toDir.startsWith(`${from}/`)) return { ok: false, reason: 'descendant' }
  return { ok: true, to: toDir ? `${toDir}/${baseName(from)}` : baseName(from) }
}

/** True only when dropping on `dir` ('' = root) from the currently-dragged path
 *  would succeed: something is dragging, `dir` is the hovered target, and
 *  planMove permits it. The gate for the truthful drop highlight — a noop or
 *  descendant target stays unlit. Reuses planMove (the single move-rule source);
 *  JSX-free so it unit-tests without a DOM. */
export function isValidDropTarget(
  dragging: string | null,
  overDir: string | null,
  dir: string,
): boolean {
  return dragging !== null && overDir === dir && planMove(dragging, dir).ok
}

/** An OS-level file drag (Finder, another app) — the dataTransfer carries the
 *  'Files' type and no internal row is dragging. Any dir is a valid target
 *  (imports copy, so no noop/descendant rules apply). JSX-free for unit tests. */
export function isExternalFileDrag(dragging: string | null, types: readonly string[]): boolean {
  return dragging === null && types.includes('Files')
}

export interface FileDrag {
  dragging: string | null
  overDir: string | null
  /** True when the live drag would successfully land on `dir` ('' = root) —
   *  drives the truthful (planMove-gated) container-drop highlight. */
  canDrop: (dir: string) => boolean
  /** Props making a row the drag SOURCE. */
  sourceProps: (path: string) => {
    draggable: true
    onDragStart: (e: ReactDragEvent) => void
    onDragEnd: () => void
  }
  /** Props making a folder/root a drop TARGET (`dir` '' = root). */
  targetProps: (dir: string) => {
    onDragOver: (e: ReactDragEvent) => void
    onDragLeave: (e: ReactDragEvent) => void
    onDrop: (e: ReactDragEvent) => void
  }
}

/** Drag state + DOM wiring for tree file-moves AND external OS-file drops. The
 *  move rules live in planMove; this hook tracks which row is dragging / hovered
 *  and hands (from, dir) to onMove on drop (Workspace applies planMove +
 *  documentRename). An OS drag (no internal row dragging, dataTransfer carries
 *  Files) reuses the same targets: highlight via the same canDrop, and the drop
 *  hands the dropped Files to onDropFiles (Workspace imports them). */
export function useFileDrag(
  onMove: (from: string, toDir: string) => void,
  onDropFiles?: (dir: string, files: File[]) => void,
): FileDrag {
  const [dragging, setDragging] = useState<string | null>(null)
  const [overDir, setOverDir] = useState<string | null>(null)
  return {
    dragging,
    overDir,
    canDrop: (dir) =>
      isValidDropTarget(dragging, overDir, dir) || (dragging === null && overDir === dir),
    sourceProps: (path) => ({
      draggable: true,
      onDragStart: (e) => {
        e.dataTransfer.setData('text/plain', path)
        e.dataTransfer.effectAllowed = 'move'
        setDragging(path)
      },
      onDragEnd: () => {
        setDragging(null)
        setOverDir(null)
      }
    }),
    targetProps: (dir) => ({
      onDragOver: (e) => {
        if (dragging === null && !isExternalFileDrag(dragging, e.dataTransfer.types)) return
        // preventDefault is what makes the element a drop target for the OS too.
        e.preventDefault()
        // The innermost target wins: without this, a dragOver on a folder row
        // bubbles to the enclosing root drop zone, whose handler runs last and
        // overwrites overDir with '' — so the folder never highlights.
        e.stopPropagation()
        setOverDir(dir)
      },
      onDragLeave: (e) => {
        e.stopPropagation()
        setOverDir((d) => (d === dir ? null : d))
      },
      onDrop: (e) => {
        const external = isExternalFileDrag(dragging, e.dataTransfer.types)
        if (dragging === null && !external) return
        e.preventDefault()
        e.stopPropagation()
        const from = dragging
        setDragging(null)
        setOverDir(null)
        if (external) {
          const files = [...e.dataTransfer.files]
          if (files.length > 0) onDropFiles?.(dir, files)
          return
        }
        if (from !== null) onMove(from, dir)
      }
    })
  }
}
