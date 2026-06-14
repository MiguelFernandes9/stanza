export interface CanvasDims {
  /** Backing-store size in device pixels (floored to whole pixels). */
  backingWidth: number
  backingHeight: number
  /** CSS size in px. Exactly backingSize / dpr so a CSS pixel maps to a whole
   *  number of backing pixels — the browser never resamples the canvas, so the
   *  page is equally sharp at every zoom (not just zooms where pageW*zoom*dpr
   *  happens to be integral). */
  cssWidth: number
  cssHeight: number
}

/** Device-pixel-aligned canvas dimensions for a PDF page viewport.
 *
 *  The backing store is floored to whole device pixels (a fractional canvas
 *  size is illegal). The CSS size is then derived back from the floored
 *  backing — `backing / dpr` — so the two are exactly consistent. Setting the
 *  CSS size to the raw (unfloored) viewport size instead leaves a sub-pixel
 *  mismatch that the browser resolves by resampling the bitmap, which reads as
 *  zoom-dependent blur. */
export function canvasDims(viewportWidth: number, viewportHeight: number, dpr: number): CanvasDims {
  const backingWidth = Math.floor(viewportWidth * dpr)
  const backingHeight = Math.floor(viewportHeight * dpr)
  return {
    backingWidth,
    backingHeight,
    cssWidth: backingWidth / dpr,
    cssHeight: backingHeight / dpr
  }
}
