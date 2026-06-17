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

const LIST_ENVS = new Set(['itemize', 'enumerate', 'description'])

/** A list environment whose `\item` macros delimit its child item blocks — so
 *  recursion splits on `\item` positions rather than walking a sub-stream. */
export function isListEnv(name: string | undefined): boolean {
  return name !== undefined && LIST_ENVS.has(name)
}

const DRAWING_ENVS = new Set(['tikzpicture', 'pgfpicture', 'picture', 'axis'])

/** A vector-drawing environment whose extent lives in its rendered PATHS, not in
 *  fine-grained interior synctex (unlike a tabular's cells). Its geometry box is
 *  seeded by the float bounding-box rect synctex gives it, then grown by the
 *  captured path graphics — so a pure-vector figure gets a real graphic box. */
export function isDrawingEnv(name: string | undefined): boolean {
  return name !== undefined && DRAWING_ENVS.has(name)
}

const FLOAT_ENVS = new Set(['figure', 'table'])

/** A float environment (figure/table, starred too): LaTeX may place it on a
 *  different page than its source. Its geometry box comes from its rendered
 *  CHILDREN (graphic + caption), not its source-site synctex — so the binner
 *  gives it no own rows and drops any source-page phantom (docs §5.3). */
export function isFloatEnv(name: string | undefined): boolean {
  return name !== undefined && FLOAT_ENVS.has(name.replace(/\*$/, ''))
}
