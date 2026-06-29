import { useEffect, useRef, useState } from 'react'
import type { JSX } from 'react'
import { ChevronRight } from 'lucide-react'

interface Props {
  /** The running op's live view — streamed reasoning + tool activity steps. */
  activity?: { thinking: string; steps: string[] }
}

/** The collapsible live feed inside a busy op bubble: the model's reasoning as it
 *  streams (auto-scrolled) under a header showing the latest activity step. Renders
 *  nothing until the first event arrives. */
export function OpActivityPanel({ activity }: Props): JSX.Element | null {
  const [open, setOpen] = useState(true)
  const bodyRef = useRef<HTMLDivElement>(null)

  // Keep the newest reasoning in view as it streams.
  useEffect(() => {
    if (open && bodyRef.current) bodyRef.current.scrollTop = bodyRef.current.scrollHeight
  }, [activity?.thinking, open])

  if (!activity || (!activity.thinking && activity.steps.length === 0)) return null
  const latestStep = activity.steps.at(-1)

  return (
    <div
      style={{
        marginTop: 8,
        border: '1px solid var(--border-faint)',
        borderRadius: 'var(--radius-md)',
        background: 'var(--surface-well)',
        overflow: 'hidden'
      }}
    >
      <button
        aria-label="Toggle reasoning"
        onClick={() => setOpen((o) => !o)}
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          width: '100%',
          padding: '6px 8px',
          background: 'transparent',
          border: 'none',
          cursor: 'pointer',
          textAlign: 'left'
        }}
      >
        <ChevronRight
          size={12}
          style={{
            flex: '0 0 auto',
            color: 'var(--ink-400)',
            transform: open ? 'rotate(90deg)' : 'none',
            transition: 'transform var(--dur-fast)'
          }}
        />
        <span
          style={{
            font: 'var(--weight-semibold) var(--text-2xs)/1 var(--font-sans)',
            color: 'var(--ink-600)',
            letterSpacing: 'var(--tracking-caps)',
            textTransform: 'uppercase',
            flex: '0 0 auto'
          }}
        >
          Thinking
        </span>
        {latestStep && (
          <span
            style={{
              flex: 1,
              minWidth: 0,
              font: 'var(--text-2xs)/1 var(--font-mono)',
              color: 'var(--ink-400)',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              textAlign: 'right'
            }}
          >
            {latestStep}
          </span>
        )}
      </button>
      {open && activity.thinking && (
        <div
          ref={bodyRef}
          data-thinking
          style={{
            maxHeight: 150,
            overflow: 'auto',
            padding: '0 8px 8px',
            font: 'var(--text-2xs)/1.5 var(--font-mono)',
            color: 'var(--ink-500)',
            whiteSpace: 'pre-wrap',
            wordBreak: 'break-word'
          }}
        >
          {activity.thinking}
        </div>
      )}
    </div>
  )
}
