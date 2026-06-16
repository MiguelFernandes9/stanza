/** Shared block-structure predicates: which environments nest into child blocks
 *  vs. stay atomic leaves. One source of truth for parse (recursion decision),
 *  flatten, geometry, and selection. See docs/nested-block-model.md §4. */

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
 *  pill placement (a centered formula box parks its pill in the left margin,
 *  BUG-35) and keeps math envs atomic in the nested-block model — the box itself
 *  comes from the text-row union like any text block. */
export function isMathEnvName(name: string | undefined): boolean {
  return name !== undefined && MATH_ENV_NAMES.has(name.replace(/\*$/, ''))
}

/** Environments whose body is intra-line content — table cells, drawing
 *  primitives, or verbatim text — not block-level structure. They stay atomic
 *  leaves; recursing would emit token soup (cell text / draw macros as blocks). */
const LEAF_CONTENT_ENVS = new Set([
  'verbatim',
  'lstlisting',
  'minted',
  'tikzpicture',
  'pgfpicture',
  'axis',
  'picture',
  'tabular',
  'tabularx',
  'array',
  'longtable',
])

/** True when an environment must NOT recurse into child blocks: its content is a
 *  single typeset unit (math / cells / drawing / verbatim) or not a node array
 *  (verbatim's content is a raw string, which would throw on recursion). `content`
 *  is the unified-latex environment content (a node array, or a string). */
export function isAtomicEnv(name: string | undefined, content: unknown): boolean {
  if (!Array.isArray(content)) return true
  if (isMathEnvName(name)) return true
  return name !== undefined && LEAF_CONTENT_ENVS.has(name.replace(/\*$/, ''))
}

/** True when an environment nests its content into child blocks: floats
 *  (figure/table), theorem-family, lists, abstract, and any unknown env by
 *  default — maximising nesting per "every descendant is a block". */
export function isContainerEnv(name: string | undefined, content: unknown): boolean {
  return !isAtomicEnv(name, content)
}
