import { afterEach, describe, expect, it } from 'vitest'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { closeBraceInEnv, enterInEnv } from './autoCloseEnv'

let view: EditorView

function mount(doc: string, cursor = doc.length): EditorView {
  const dom = document.createElement('div')
  document.body.appendChild(dom)
  view = new EditorView({ state: EditorState.create({ doc, selection: { anchor: cursor } }), parent: dom })
  return view
}

afterEach(() => {
  view.destroy()
  view.dom.remove()
})

describe('autoCloseEnv — auto-\\end without indent', () => {
  it('typing } to finish \\begin{itemize} inserts a matching \\end, body un-indented', () => {
    expect(closeBraceInEnv(mount('\\begin{itemize'))).toBe(true)
    expect(view.state.doc.toString()).toBe('\\begin{itemize}\n\n\\end{itemize}')
    // cursor parks on the empty body line, not the \end line
    expect(view.state.doc.lineAt(view.state.selection.main.head).number).toBe(2)
  })

  it('Enter right after \\begin{equation} opens the body and adds \\end', () => {
    expect(enterInEnv(mount('\\begin{equation}'))).toBe(true)
    expect(view.state.doc.toString()).toBe('\\begin{equation}\n\n\\end{equation}')
  })

  it('aligns \\end to the \\begin line indent and adds NONE of its own', () => {
    expect(enterInEnv(mount('  \\begin{eq}'))).toBe(true)
    expect(view.state.doc.toString()).toBe('  \\begin{eq}\n  \n  \\end{eq}')
  })

  it('does nothing when the cursor is not after a \\begin', () => {
    expect(enterInEnv(mount('just prose'))).toBe(false)
    expect(closeBraceInEnv(mount('x'))).toBe(false)
  })
})
