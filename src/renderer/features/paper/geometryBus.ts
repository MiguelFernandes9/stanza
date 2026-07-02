import type { GeometrySnapshot } from '../../../shared/ipc'

// A one-slot holder for the latest block-geometry snapshot. PaperPane pushes it
// after every bin; the bug-report dialog (a different subtree) pulls it on open.
// A module singleton instead of lifted state: the snapshot is read on demand, not
// rendered, so threading it through props or context would add re-renders for no
// UI benefit. Last write wins — only the geometry currently on screen matters.

let latest: GeometrySnapshot | null = null

export function setGeometry(snapshot: GeometrySnapshot | null): void {
  latest = snapshot
}

export function getGeometry(): GeometrySnapshot | null {
  return latest
}
