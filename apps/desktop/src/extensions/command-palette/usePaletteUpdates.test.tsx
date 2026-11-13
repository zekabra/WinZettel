// @vitest-environment jsdom
import { act, cleanup, renderHook } from '@testing-library/react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { EditorViewType } from '@/constants/editorViewType'
import type { EditorCommandTarget } from './editorCommandTarget'
import { usePaletteUpdates } from './usePaletteUpdates'

vi.mock('@/commands', () => ({
  commandRegistry: { onDidChangeCommands: () => ({ dispose: vi.fn() }) },
}))

const sourceListeners = new Set<() => void>()
vi.mock('@/components/EditorArea/sourceCodeEditorRegistry', () => ({
  subscribeSourceCodeEditors: (listener: () => void) => {
    sourceListeners.add(listener)
    return () => {
      sourceListeners.delete(listener)
    }
  },
}))

afterEach(() => {
  cleanup()
  sourceListeners.clear()
  document.body.replaceChildren()
})

describe('command palette updates', () => {
  it('refreshes while the palette is open when the source editor registry changes', () => {
    const rendered = vi.fn()
    const hook = renderHook(() => {
      usePaletteUpdates(null)
      rendered()
    })
    const before = rendered.mock.calls.length
    act(() => sourceListeners.forEach((listener) => listener()))
    expect(rendered.mock.calls.length).toBeGreaterThan(before)
    hook.unmount()
    expect(sourceListeners.size).toBe(0)
  })

  it('listens to the captured CodeMirror view and detaches on close', () => {
    const view = new EditorView({
      state: EditorState.create({ doc: 'text' }),
      parent: document.body,
    })
    const rendered = vi.fn()
    const target: EditorCommandTarget = {
      fileId: 'file',
      mode: EditorViewType.SOURCECODE,
      source: view,
    }
    const hook = renderHook(() => {
      usePaletteUpdates(target)
      rendered()
    })
    const before = rendered.mock.calls.length
    act(() => {
      view.dispatch({ selection: { anchor: 1 } })
    })
    expect(rendered.mock.calls.length).toBeGreaterThan(before)
    const afterDispatch = rendered.mock.calls.length
    hook.unmount()
    act(() => {
      view.dispatch({ selection: { anchor: 0 } })
    })
    expect(rendered.mock.calls.length).toBe(afterDispatch)
    view.destroy()
  })
})
