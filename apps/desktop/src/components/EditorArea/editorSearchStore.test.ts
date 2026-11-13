import { beforeEach, describe, expect, it } from 'vitest'
import { dismissEditorSearch, useEditorSearchStore } from './editorSearchStore'

const reset = () =>
  useEditorSearchStore.setState({ owner: 'document', query: 'foo', replacement: 'bar' })

beforeEach(reset)

describe('search dismissal', () => {
  it('drops the term and the replacement when the bar is dismissed', () => {
    dismissEditorSearch('document')

    expect(useEditorSearchStore.getState().query).toBe('')
    expect(useEditorSearchStore.getState().replacement).toBe('')
    expect(useEditorSearchStore.getState().owner).toBeNull()
  })

  it('clears even though closing removes the owner first', () => {
    // Regression: the dismiss ran after the close, and the owner guard turned it into a
    // no-op, so the old term survived a reopen and its matches were repainted.
    useEditorSearchStore.setState({ owner: null, query: 'stale' })
    dismissEditorSearch()
    expect(useEditorSearchStore.getState().query).toBe('')
  })
})
