import { act, cleanup, renderHook, waitFor } from '@testing-library/react'
import { enableMapSet } from 'immer'
import { StrictMode } from 'react'
import { EditorState } from '@codemirror/state'
import { EditorView } from '@codemirror/view'
import type { MfCodemirrorView } from 'rme'
import { afterEach, describe, expect, it, vi } from 'vitest'
import useEditorStore from '@/stores/useEditorStore'
import useEditorViewTypeStore from '@/stores/useEditorViewTypeStore'
import { EditorViewType } from '@/constants/editorViewType'
import {
  closeEditorSearch,
  openDocumentSearch,
  reportEditorSearchLoadFailure,
  requestSearchNavigation,
  useEditorSearchStore,
} from '../../editorSearchStore'
import { useEditorSearchController } from './use-editor-search'
import { setSourceCodeEditor, getSourceCodeFind } from '../../sourceCodeEditorRegistry'
import type { SourceFind } from '../../sourceCodeFind'

type RevealSourceMatch = NonNullable<SourceFind['revealSourceMatch']>

enableMapSet()

const target = {
  fileId: 'first',
  path: '/first.md',
  line: 1,
  lineText: 'foo foo',
  query: 'foo',
  startColumn: 4,
  endColumn: 7,
}

const openViews: EditorView[] = []

function registerSource(id = 'first', doc = 'foo foo') {
  const view = new EditorView({
    state: EditorState.create({ doc }),
    parent: document.body,
  })
  openViews.push(view)
  const source = { cm: view, setSearchState: vi.fn() } as unknown as MfCodemirrorView
  act(() => setSourceCodeEditor(id, source))
  return { view, source, find: getSourceCodeFind(source)! }
}

function useSingleSourceMode(id = 'first') {
  act(() => {
    useEditorStore.setState({ activeId: id, activeGroupId: 'main' })
    useEditorViewTypeStore.getState().setEditorViewType(id, EditorViewType.SOURCECODE)
  })
}

afterEach(() => {
  cleanup()
  closeEditorSearch()
  setSourceCodeEditor('first', undefined)
  setSourceCodeEditor('second', undefined)
  openViews.splice(0).forEach((view) => view.destroy())
  useEditorViewTypeStore.setState({ editorViewTypeMap: new Map(), editorGroupViewTypeMap: new Map() })
  useEditorSearchStore.setState({
    owner: null,
    query: '',
    composing: false,
    navigation: null,
    error: null,
  })
})

describe('editor search request ownership', () => {
  it.each([
    [EditorViewType.PREVIEW, false],
    [EditorViewType.SOURCECODE, true],
  ] as const)('opens the bar from either pane mode %s', (mode, expected) => {
    useEditorStore.setState({ activeId: 'first', activeGroupId: 'main' })
    useEditorViewTypeStore.setState({ editorViewTypeMap: new Map(), editorGroupViewTypeMap: new Map() })
    useEditorViewTypeStore.getState().setEditorViewType('first', mode, 'main')

    expect(openDocumentSearch()).toBe(expected)
    expect(useEditorSearchStore.getState().owner).toBe(expected ? 'document' : null)
  })

  it('reveals a pending request once the source instance registers', async () => {
    useSingleSourceMode()
    const hook = renderHook(useEditorSearchController, { wrapper: StrictMode })
    act(() => requestSearchNavigation(target))
    const { find, view } = registerSource()
    await waitFor(() => expect(useEditorSearchStore.getState().navigation?.fileId).toBe('first'))
    await waitFor(() => expect(view.state.selection.main.from).toBe(4))
    expect(view.state.selection.main.to).toBe(view.state.selection.main.from)
    expect(find.getState().matches).toHaveLength(1)
    hook.rerender()
    expect(view.state.selection.main.from).toBe(4)
  })

  it('uses the same host controller for Source Code without stealing input focus', async () => {
    useSingleSourceMode()
    const { source, view } = registerSource()
    const hook = renderHook(useEditorSearchController)
    const input = document.createElement('input')
    document.body.append(input)
    input.focus()
    try {
      act(() => {
        openDocumentSearch()
        hook.result.current.setQuery('foo')
      })
      await waitFor(() => expect(hook.result.current.total).toBe(2))
      act(() => hook.result.current.findNext())
      await waitFor(() => expect(view.state.selection.main.from).toBe(4))
      expect(document.activeElement).toBe(input)
      act(() => requestSearchNavigation({ ...target, startColumn: 0, endColumn: 3 }))
      await waitFor(() => expect(view.state.selection.main.from).toBe(0))
      expect(getSourceCodeFind(source)?.getState().matches).toHaveLength(1)
    } finally {
      input.remove()
    }
  })

  it('aborts rapid cross-file navigation and ignores the old failure', async () => {
    useSingleSourceMode()
    const first = registerSource()
    let finish!: () => void
    const pending = new Promise<void>((resolve) => {
      finish = resolve
    })
    const firstReveal = vi.fn<RevealSourceMatch>()
    firstReveal.mockImplementation(async () => {
      await pending
      return null
    })
    first.find.revealSourceMatch = firstReveal as RevealSourceMatch
    renderHook(useEditorSearchController)
    act(() => requestSearchNavigation(target))
    await waitFor(() => expect(firstReveal).toHaveBeenCalledOnce())

    const secondReveal = vi.fn(async () => ({ status: 'exact' as const }))
    act(() => {
      useEditorStore.setState({ activeId: 'second' })
      useEditorViewTypeStore.getState().setEditorViewType('second', EditorViewType.SOURCECODE)
    })
    const second = registerSource('second', 'foo foo bar')
    second.find.revealSourceMatch = secondReveal
    act(() => requestSearchNavigation({ ...target, fileId: 'second', path: '/second.md' }))
    await waitFor(() => expect(secondReveal).toHaveBeenCalledOnce())
    expect(firstReveal.mock.calls[0][1]?.signal?.aborted).toBe(true)
    await act(async () => finish())
    expect(useEditorSearchStore.getState().error).toBeNull()
  })

  it.each(['close', 'group', 'mode', 'destroy', 'load failure'])(
    'cancels a pending request on %s',
    async (action) => {
      useSingleSourceMode()
      const registered = registerSource()
      const reveal = vi.fn<RevealSourceMatch>()
      reveal.mockImplementation(() => new Promise<null>(() => {}))
      registered.find.revealSourceMatch = reveal as RevealSourceMatch
      renderHook(useEditorSearchController)
      act(() => requestSearchNavigation(target))
      await waitFor(() => expect(reveal).toHaveBeenCalledOnce())
      act(() => {
        if (action === 'close') closeEditorSearch()
        if (action === 'group') useEditorStore.setState({ activeGroupId: 'second-pane' })
        if (action === 'mode')
          useEditorViewTypeStore.getState().setEditorViewType('first', EditorViewType.PREVIEW)
        if (action === 'destroy') setSourceCodeEditor('first', undefined)
        if (action === 'load failure') reportEditorSearchLoadFailure('first', 'main')
      })
      expect(reveal.mock.calls[0][1]?.signal?.aborted).toBe(true)
      if (action === 'load failure') expect(useEditorSearchStore.getState().error).toBe('failed')
    },
  )

  it('debounces query drafts and preserves repeated-open text', async () => {
    useSingleSourceMode()
    const { find, source } = registerSource()
    const searchAsync = vi.fn(find.searchAsync)
    find.searchAsync = searchAsync
    const hook = renderHook(useEditorSearchController)
    act(() => {
      openDocumentSearch()
      hook.result.current.setQuery('f')
    })
    act(() => hook.result.current.setQuery('foo'))
    act(() => openDocumentSearch())
    await waitFor(() => expect(searchAsync).toHaveBeenCalledOnce())
    expect(searchAsync.mock.calls[0][0]).toMatchObject({ query: 'foo' })
    expect(getSourceCodeFind(source)?.getState().query).toBe('foo')
    act(() => closeEditorSearch())
    expect(useEditorSearchStore.getState().owner).toBeNull()
  })
})
