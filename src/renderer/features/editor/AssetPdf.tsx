import { useRef } from 'react'
import type { JSX, ReactNode } from 'react'
import { usePdfDocument } from '../pdf/usePdfDocument'
import { PdfPageStack } from '../pdf/PdfPageStack'

/** PDF asset renderer, in its own module so EditorPane can lazy-load it — this
 *  keeps pdf.js (and its DOMMatrix/canvas deps) out of the editor's static
 *  import graph, where it would break jsdom unit tests and bloat startup. */

function Centered({ children }: { children: ReactNode }): JSX.Element {
  return (
    <div
      style={{
        position: 'absolute',
        inset: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '0 24px',
        textAlign: 'center',
        color: 'var(--ink-400)',
        font: 'var(--weight-regular) var(--text-sm)/1.5 var(--font-sans)'
      }}
    >
      {children}
    </div>
  )
}

export default function AssetPdf({ url }: { url: string }): JSX.Element {
  const scrollRef = useRef<HTMLDivElement | null>(null)
  const { pdf, error } = usePdfDocument(url)
  if (error) return <Centered>Could not open PDF — {error}</Centered>
  if (!pdf) return <Centered>Loading…</Centered>
  return (
    <div ref={scrollRef} style={{ position: 'absolute', inset: 0, overflow: 'auto', padding: 16 }}>
      <PdfPageStack pdf={pdf} scale={1.5} scrollRef={scrollRef} onGeometry={() => {}} />
    </div>
  )
}
