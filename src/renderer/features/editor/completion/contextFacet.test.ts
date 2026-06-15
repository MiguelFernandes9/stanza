import { describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EMPTY_CONTEXT } from './projectContext'
import { projectContextField, readProjectContext, setProjectContext } from './contextFacet'

describe('contextFacet', () => {
  it('defaults to the empty context', () => {
    const state = EditorState.create({ extensions: [projectContextField] })
    expect(readProjectContext(state)).toBe(EMPTY_CONTEXT)
  })

  it('reads the empty context even when the field is absent', () => {
    expect(readProjectContext(EditorState.create({}))).toBe(EMPTY_CONTEXT)
  })

  it('updates when a setProjectContext effect is dispatched', () => {
    const state = EditorState.create({ extensions: [projectContextField] })
    const ctx = { ...EMPTY_CONTEXT, mainFile: 'main.tex', activeFile: 'ch1.tex' }
    const next = state.update({ effects: setProjectContext.of(ctx) }).state
    expect(readProjectContext(next).mainFile).toBe('main.tex')
    expect(readProjectContext(next).activeFile).toBe('ch1.tex')
  })
})
