import type { CSSProperties, JSX, ReactNode } from 'react'

interface Props {
  /** Strip height (px). Default clears the hiddenInset traffic lights. */
  height?: number
  /** Optional strip content (e.g. a screen title) — rendered no-drag so it
   *  stays clickable inside the draggable region. */
  children?: ReactNode
}

/** Draggable chrome strip for a frameless (`hiddenInset`) window. Top-level
 *  screens without a `TitleBar` (e.g. `OpenScreen`) need one so the window can
 *  be moved by dragging; interactive children are exempted via no-drag. */
export function DragRegion({ height = 38, children }: Props): JSX.Element {
  return (
    <div
      style={
        {
          flex: '0 0 auto',
          height,
          width: '100%',
          WebkitAppRegion: 'drag'
        } as CSSProperties
      }
    >
      {children != null && (
        <div style={{ height: '100%', WebkitAppRegion: 'no-drag' } as CSSProperties}>{children}</div>
      )}
    </div>
  )
}
