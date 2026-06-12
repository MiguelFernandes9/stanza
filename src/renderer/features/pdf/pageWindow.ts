/** PDF page virtualization math (kept pure so the memory-bounding window is
 *  testable without a real document). The window caps how many page canvases
 *  exist at once — the fast-scroll white-out (L6) came from unbounded canvas +
 *  page-proxy accumulation. */

/** Inclusive, 1-based page range intersecting the viewport, expanded by a
 *  ±buffer. `[1, 0]` means empty (no pages). */
export function visiblePageRange(
  scrollTop: number,
  viewportH: number,
  slot: number,
  numPages: number,
  buffer = 1
): [number, number] {
  if (numPages <= 0 || slot <= 0) return [1, 0]
  const firstVisible = Math.floor(scrollTop / slot) + 1
  const lastVisible = Math.floor((scrollTop + viewportH - 1) / slot) + 1
  const first = Math.max(1, firstVisible - buffer)
  const last = Math.min(numPages, lastVisible + buffer)
  return [first, last]
}

/** Cached page numbers that fall outside the keep range — their proxies and
 *  canvases should be released. */
export function pagesToEvict(cached: Set<number>, keep: [number, number]): Set<number> {
  const evict = new Set<number>()
  for (const n of cached) {
    if (n < keep[0] || n > keep[1]) evict.add(n)
  }
  return evict
}
