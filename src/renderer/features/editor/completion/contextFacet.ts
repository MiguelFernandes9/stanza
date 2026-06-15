import { StateEffect, StateField } from '@codemirror/state'
import type { EditorState } from '@codemirror/state'
import { EMPTY_CONTEXT, type ProjectContext } from './projectContext'

/** Reactive seam between Workspace and the completion sources: the editor holds
 *  the current ProjectContext in a StateField, Workspace pushes updates via
 *  this effect (on compile + file-tree change), and the sources read it at
 *  completion time — so they stay pure and never close over a stale snapshot. */
export const setProjectContext = StateEffect.define<ProjectContext>()

export const projectContextField = StateField.define<ProjectContext>({
  create: () => EMPTY_CONTEXT,
  update(value, tr) {
    for (const effect of tr.effects) {
      if (effect.is(setProjectContext)) return effect.value
    }
    return value
  }
})

/** Current project context, or the empty default when the field is absent. */
export function readProjectContext(state: EditorState): ProjectContext {
  return state.field(projectContextField, false) ?? EMPTY_CONTEXT
}
