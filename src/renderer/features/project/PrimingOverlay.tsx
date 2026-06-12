import type { JSX } from 'react'
import { Check, Sparkles } from 'lucide-react'
import { Button } from '@renderer/components'
import type { PrimeDisplayStep } from './primeSteps'

interface Props {
  project: string
  steps: PrimeDisplayStep[]
  onCancel: () => void
}

/** One-time setup overlay — design §1: blocking scrim, 420px card,
 *  four-step checklist driven by prime:status events. */
export function PrimingOverlay({ project, steps, onCancel }: Props): JSX.Element {
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
    >
      <div
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
          <Sparkles size={16} style={{ color: 'var(--clay-500)' }} />
          <span
            style={{ font: 'var(--weight-semibold) var(--text-md)/1.2 var(--font-sans)', color: 'var(--ink-900)' }}
          >
            Setting up {project}
          </span>
        </div>
        <div style={{ font: 'var(--text-sm)/1.5 var(--font-sans)', color: 'var(--ink-500)', marginBottom: 16 }}>
          One-time setup — your files aren&apos;t changed until you accept an edit.
        </div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 9 }}>
          {steps.map((s) => (
            <div
              key={s.step}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 10,
                opacity: s.state === 'pending' ? 0.42 : 1,
                transition: 'opacity var(--dur-fast)'
              }}
            >
              <span
                style={{
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  width: 18,
                  height: 18,
                  flex: '0 0 auto'
                }}
              >
                {s.state === 'done' ? (
                  <span
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      width: 16,
                      height: 16,
                      borderRadius: '50%',
                      background: 'var(--add-bg)',
                      color: 'var(--add-600)'
                    }}
                  >
                    <Check size={10} strokeWidth={3} />
                  </span>
                ) : s.state === 'running' ? (
                  <span
                    style={{
                      width: 8,
                      height: 8,
                      borderRadius: '50%',
                      background: 'var(--clay-400)',
                      animation: 'stz-pulse 0.9s var(--ease-in-out) infinite'
                    }}
                  />
                ) : (
                  <span
                    style={{ width: 8, height: 8, borderRadius: '50%', border: '1.5px solid var(--line-ink)' }}
                  />
                )}
              </span>
              <span
                style={{
                  flex: 1,
                  font: 'var(--text-sm)/1.3 var(--font-sans)',
                  color: s.state === 'done' ? 'var(--ink-500)' : 'var(--ink-800)'
                }}
              >
                {s.label}
              </span>
              {s.state === 'done' && s.detail && (
                <span style={{ font: 'var(--text-2xs)/1 var(--font-mono)', color: 'var(--ink-400)' }}>
                  {s.detail}
                </span>
              )}
            </div>
          ))}
        </div>
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 18 }}>
          <Button size="sm" variant="ghost" onClick={onCancel}>
            Cancel
          </Button>
        </div>
      </div>
    </div>
  )
}
