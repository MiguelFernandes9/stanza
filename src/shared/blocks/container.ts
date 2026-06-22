/** Environment predicates for the geometry layer. Under the flat content model
 *  the parser no longer classifies container-vs-leaf, so only two distinctions
 *  remain: floats (placement page) and display math (pill placement). */

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

/** Environments LaTeX places on a page that can differ from their source:
 *  figure/table float to where they fit; thebibliography sets after the body.
 *  Classification predicate only — the binner is ink-grounded and kind-agnostic,
 *  NOT keyed on this (the capture harness tags fixture blocks with it). */
const FLOAT_ENVS = new Set(['figure', 'table', 'thebibliography'])

/** True for a placement-displaced environment (see FLOAT_ENVS). */
export function isFloatEnv(name: string | undefined): boolean {
  return name !== undefined && FLOAT_ENVS.has(name.replace(/\*$/, ''))
}
