import { describe, expect, it } from 'vitest'
import useEditorStore from '@/stores/useEditorStore'
import { canSplitEditor, countEditorPanes } from './editorPaneLimit'

const leaf = (id: string, opened: string[] = []) => ({ type: 'leaf' as const, id, opened })

describe('pane limit', () => {
  it('is reached only when two panes exist', () => {
    expect(countEditorPanes(leaf('left'))).toBe(1)
    expect(canSplitEditor(leaf('left'))).toBe(true)
    expect(
      countEditorPanes({ type: 'branch', id: 'root', direction: 'horizontal', sizes: [50, 50], children: [leaf('left'), leaf('right')] }),
    ).toBe(2)
    expect(
      canSplitEditor({ type: 'branch', id: 'root', direction: 'horizontal', sizes: [50, 50], children: [leaf('left'), leaf('right')] }),
    ).toBe(false)
  })
})

describe('tabs are not limited', () => {
  it('keeps every tab that is opened in one pane', () => {
    useEditorStore.setState({
      editorLayout: { type: 'leaf', id: 'group', opened: [], activeId: undefined },
      activeGroupId: 'group',
    })

    for (const id of ['a', 'b', 'c', 'd']) {
      useEditorStore.getState().openFileInGroup('group', id)
    }

    // The pane limit is about splits; the tabs keep growing as before.
    expect(useEditorStore.getState().getGroup('group')?.opened).toEqual(['a', 'b', 'c', 'd'])
  })
})
