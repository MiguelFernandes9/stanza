/** Environment predicates used by the geometry layer. Under the flat content
 *  model the parser no longer classifies container-vs-leaf (every environment is
 *  a single block), so the only distinctions that remain are the two the renderer
 *  needs: floats (placed on a different page than their source) and display math
 *  (pill placement). One home for both. */

const MATH_ENV_NAMES = new Set([
  'equation',
  'align',
  'gather',
  'multline',
  'split',
  'eqnarray',
  'displaymath',
  'alignat',
  'flalign',
])

/** Is this a display-math environment name (starred variants included)? Drives
 *  pill placement — a centered formula box parks its pill in the left margin
 *  (BUG-35). */
export function isMathEnvName(name: string | undefined): boolean {
  return name !== undefined && MATH_ENV_NAMES.has(name.replace(/\*$/, ''))
}

/** Environments LaTeX renders on a PLACEMENT page that can differ from their
 *  source position: floats (figure/table) move to where they fit; thebibliography
 *  is set after all body text and spills onto its own page, while its `\begin`
 *  galley origin maps a page earlier. NOTE: the geometry binner no longer keys on
 *  this — it is ink-grounded and kind-agnostic, dropping every block's origin-page
 *  phantom by rendered ink rather than by float kind. Retained as a classification
 *  predicate only (the capture harness tags fixture blocks with it). */
const FLOAT_ENVS = new Set(['figure', 'table', 'thebibliography'])

/** True for a placement-displaced environment (see FLOAT_ENVS). Classification
 *  only — NOT consumed by the binner. */
export function isFloatEnv(name: string | undefined): boolean {
  return name !== undefined && FLOAT_ENVS.has(name.replace(/\*$/, ''))
}
