import type { PrimeStep } from '../../../shared/ipc'

/** Canonical checklist order (backend B5.5 emits these four). */
export const PRIME_ORDER = ['read', 'parse', 'git', 'session'] as const

/** 'open' = priming an existing folder; 'new' = creating from template. */
export type PrimeVariant = 'open' | 'new'

export interface PrimeDisplayStep {
  step: PrimeStep['step']
  label: string
  state: PrimeStep['state']
  detail?: string
}

const LABELS: Record<PrimeStep['step'], string> = {
  read: 'Reading sources',
  parse: 'Parsing into blocks',
  git: 'Initializing version control',
  session: 'Starting Claude session'
}

/** Folds the prime:status event stream into the four-step checklist the
 *  overlay renders: latest state per step wins, details stick. */
export function foldPrimeSteps(events: PrimeStep[], variant: PrimeVariant): PrimeDisplayStep[] {
  const byStep = new Map<PrimeStep['step'], { state: PrimeStep['state']; detail?: string }>()
  for (const e of events) {
    const prev = byStep.get(e.step)
    byStep.set(e.step, { state: e.state, detail: e.detail ?? prev?.detail })
  }
  return PRIME_ORDER.map((step) => {
    const seen = byStep.get(step)
    return {
      step,
      label: step === 'read' && variant === 'new' ? 'Creating from template' : LABELS[step],
      state: seen?.state ?? 'pending',
      detail: seen?.detail
    }
  })
}
