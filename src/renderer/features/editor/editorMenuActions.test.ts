import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorSelection, EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { buildEditorMenu } from './editorMenuActions'
import type { ContextMenuAction, ContextMenuEntry } from '../workspace/FileContextMenu'

/** Mount a CodeMirror view on a detached div so commands can dispatch. */
function mountView(doc: string, selection?: { anchor: number; head: number }): EditorView {
  const parent = document.createElement('div')
  document.body.appendChild(parent)
  return new EditorView({
    parent,
    state: EditorState.create({
      doc,
      selection: selection ? EditorSelection.single(selection.anchor, selection.head) : undefined
    })
  })
}

const isAction = (e: ContextMenuEntry): e is ContextMenuAction => !('sep' in e)
const labels = (items: ContextMenuEntry[]): string[] => items.filter(isAction).map((a) => a.label)
const find = (items: ContextMenuEntry[], label: string): ContextMenuAction =>
  items.filter(isAction).find((a) => a.label === label)!

afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

describe('buildEditorMenu', () => {
  it('lists the editing actions in order with separators', () => {
    const view = mountView('hello world')
    expect(labels(buildEditorMenu(view))).toEqual([
      'Cut',
      'Copy',
      'Paste',
      'Select All',
      'Undo',
      'Redo'
    ])
    view.destroy()
  })

  it('disables Cut/Copy when the selection is empty', () => {
    const items = buildEditorMenu(mountView('hello', { anchor: 2, head: 2 }))
    expect(find(items, 'Cut').disabled).toBe(true)
    expect(find(items, 'Copy').disabled).toBe(true)
    // Paste / Select All / Undo / Redo never gate on a selection.
    expect(find(items, 'Paste').disabled).toBeFalsy()
    expect(find(items, 'Select All').disabled).toBeFalsy()
  })

  it('enables Cut/Copy when text is selected', () => {
    const items = buildEditorMenu(mountView('hello', { anchor: 0, head: 5 }))
    expect(find(items, 'Cut').disabled).toBeFalsy()
    expect(find(items, 'Copy').disabled).toBeFalsy()
  })

  it('Copy writes the selected text to the clipboard', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const view = mountView('hello world', { anchor: 0, head: 5 })
    find(buildEditorMenu(view), 'Copy').onSelect()
    await vi.waitFor(() => expect(writeText).toHaveBeenCalledWith('hello'))
    view.destroy()
  })

  it('Cut copies then removes the selection', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    const view = mountView('hello world', { anchor: 0, head: 6 })
    find(buildEditorMenu(view), 'Cut').onSelect()
    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('world'))
    expect(writeText).toHaveBeenCalledWith('hello ')
    view.destroy()
  })

  it('Paste inserts clipboard text at the selection', async () => {
    const readText = vi.fn().mockResolvedValue('X')
    vi.stubGlobal('navigator', { clipboard: { readText } })
    const view = mountView('ab', { anchor: 1, head: 1 })
    find(buildEditorMenu(view), 'Paste').onSelect()
    await vi.waitFor(() => expect(view.state.doc.toString()).toBe('aXb'))
    view.destroy()
  })

  it('Select All selects the whole document', () => {
    const view = mountView('hello', { anchor: 0, head: 0 })
    find(buildEditorMenu(view), 'Select All').onSelect()
    const { from, to } = view.state.selection.main
    expect([from, to]).toEqual([0, 5])
    view.destroy()
  })
})
