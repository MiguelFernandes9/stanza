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

export interface FileDrag {
  dragging: string | null
  overDir: string | null
  /** Props making a row the drag SOURCE. */
  sourceProps: (path: string) => {
    draggable: true
    onDragStart: (e: ReactDragEvent) => void
    onDragEnd: () => void
  }
  /** Props making a folder/root a drop TARGET (`dir` '' = root). */
  targetProps: (dir: string) => {
    onDragOver: (e: ReactDragEvent) => void
    onDragLeave: () => void
    onDrop: (e: ReactDragEvent) => void
  }
}

/** Drag state + DOM wiring for tree file-moves. The rules live in planMove;
 *  this hook tracks which row is dragging / hovered and hands (from, dir) to
 *  onMove on drop (Workspace applies planMove + documentRename). Interaction
 *  is the live gate. */
export function useFileDrag(onMove: (from: string, toDir: string) => void): FileDrag {
  const [dragging, setDragging] = useState<string | null>(null)
  const [overDir, setOverDir] = useState<string | null>(null)
  return {
    dragging,
    overDir,
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
        if (dragging === null) return
        e.preventDefault()
        setOverDir(dir)
      },
      onDragLeave: () => setOverDir((d) => (d === dir ? null : d)),
      onDrop: (e) => {
        if (dragging === null) return
        e.preventDefault()
        e.stopPropagation()
        const from = dragging
        setDragging(null)
        setOverDir(null)
        onMove(from, dir)
      }
    })
  }
}
