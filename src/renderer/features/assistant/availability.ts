import { useCallback, useEffect, useState } from 'react'
import { client } from '@renderer/lib/client'
import type { ClaudeAvailability } from '@shared/ipc'

/** Renderer-side view of Claude availability. `checking` is the pre-probe state;
 *  it resolves to `available` or `unavailable` once the first probe returns. */
export type AiStatus =
  | { status: 'checking' }
  | { status: 'available'; email?: string; subscriptionType?: string }
  | { status: 'unavailable'; reason: AiReason }

export type AiReason = 'logged-out' | 'not-installed' | 'error'

export function fromPayload(a: ClaudeAvailability): AiStatus {
  if (a.available) {
    return { status: 'available', email: a.email, subscriptionType: a.subscriptionType }
  }
  return { status: 'unavailable', reason: a.reason ?? 'error' }
}

/** AI is gated OFF only once we KNOW it's unavailable. While the first probe is
 *  in flight we stay enabled (optimistic) so the common logged-in launch never
 *  flashes a disabled UI. */
export function isAiEnabled(s: AiStatus): boolean {
  return s.status !== 'unavailable'
}

/** Short human reason for indicators / tooltips. */
export function reasonLabel(reason: AiReason): string {
  switch (reason) {
    case 'logged-out':
      return 'Signed out of Claude'
    case 'not-installed':
      return 'Claude CLI not found'
    case 'error':
      return 'Claude check failed'
  }
}

export interface AiAvailability {
  ai: AiStatus
  enabled: boolean
  /** Force a fresh probe (Settings "Recheck") — also re-enables after a sign-in. */
  recheck: () => void
}

/** App-level: probe availability once on mount, then track runtime flips
 *  (login/logout broadcasts). The single source the whole renderer gates on. */
export function useAiAvailability(): AiAvailability {
  const [ai, setAi] = useState<AiStatus>({ status: 'checking' })

  useEffect(() => {
    let alive = true
    void client.claudeAvailability().then(
      (a) => {
        if (alive) setAi(fromPayload(a))
      },
      () => {
        if (alive) setAi({ status: 'unavailable', reason: 'error' })
      },
    )
    const off = client.onClaudeAvailabilityChanged((a) => setAi(fromPayload(a)))
    return () => {
      alive = false
      off()
    }
  }, [])

  const recheck = useCallback(() => {
    setAi({ status: 'checking' })
    void client.claudeAvailability(true).then(
      (a) => setAi(fromPayload(a)),
      () => setAi({ status: 'unavailable', reason: 'error' }),
    )
  }, [])

  return { ai, enabled: isAiEnabled(ai), recheck }
}
