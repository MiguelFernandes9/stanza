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

const FLOAT_ENVS = new Set(['figure', 'table'])

/** A float environment (figure/table, starred too): LaTeX may place it on a
 *  different page than its source. Its geometry box comes from its RENDER page —
 *  where the bulk of its rendered ink lands — not its source-site synctex; the
 *  binner drops the origin-page phantom. */
export function isFloatEnv(name: string | undefined): boolean {
  return name !== undefined && FLOAT_ENVS.has(name.replace(/\*$/, ''))
}
