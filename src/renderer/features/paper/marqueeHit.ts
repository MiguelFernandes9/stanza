/** Geometry for marquee (rubber-band) block selection. Pure + DOM-free so the
 *  touch rule and de-duplication are unit-testable; the hook feeds it client
 *  rects from the rendered block overlays. */

export interface Box {
  left: number
  top: number
  right: number
  bottom: number
}

/** Normalise a drag (two corner points, any direction) into a Box. */
export function boxFromPoints(x0: number, y0: number, x1: number, y1: number): Box {
  return { left: Math.min(x0, x1), top: Math.min(y0, y1), right: Math.max(x0, x1), bottom: Math.max(y0, y1) }
}

/** AABB intersection, inclusive — the "touch" rule: a marquee that grazes a
 *  block (even sharing an edge) counts as covering it. */
export function rectsTouch(a: Box, b: Box): boolean {
  return a.left <= b.right && a.right >= b.left && a.top <= b.bottom && a.bottom >= b.top
}

/** Unique block ids whose overlay box the marquee touches. A block straddling
 *  pages contributes several overlays under one id, so we de-dupe. */
export function idsInMarquee(marquee: Box, overlays: ReadonlyArray<{ id: string; box: Box }>): string[] {
  const hit = new Set<string>()
  for (const o of overlays) if (rectsTouch(marquee, o.box)) hit.add(o.id)
  return [...hit]
}
